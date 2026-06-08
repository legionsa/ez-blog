'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useMemo } from 'react';
import { ExtendedRecordMap } from 'notion-types';

// react-notion-x core styles
import 'react-notion-x/src/styles.css';

// Dynamically import NotionRenderer to avoid SSR issues
const NotionRenderer = dynamic(
    () => import('react-notion-x').then((m) => m.NotionRenderer),
    {
        ssr: false,
        loading: () => <div className="animate-pulse bg-muted h-96 rounded-lg" />
    }
);

// Collection/Database component (optional)
const Collection = dynamic(
    () => import('react-notion-x/build/third-party/collection').then((m) => m.Collection),
    { ssr: false }
);

// Modal for images (optional)
const Modal = dynamic(
    () => import('react-notion-x/build/third-party/modal').then((m) => m.Modal),
    { ssr: false }
);

const Code = dynamic(
    () => import('react-notion-x/build/third-party/code').then((m) => m.Code),
    { ssr: false }
);

interface NotionPageRendererProps {
    recordMap: ExtendedRecordMap;
    rootPageId?: string;
    fullPage?: boolean;
    darkMode?: boolean;
    previewImages?: boolean;
    showCollectionViewDropdown?: boolean;
    showTableOfContents?: boolean;
    minTableOfContentsItems?: number;
    className?: string;
}

// Extract text from Notion rich text array
const extractTextFromRichText = (richText: any): string => {
    if (!richText) return '';
    if (typeof richText === 'string') return richText;
    if (Array.isArray(richText)) {
        return richText.map((item: any) => {
            if (typeof item === 'string') return item;
            if (Array.isArray(item) && item[0]) return item[0];
            return '';
        }).join('');
    }
    return '';
};

// Custom Callout Component
const CustomCallout = ({ block, children }: { block: any; children: React.ReactNode }) => {
    const { format, properties } = block;
    const icon = format?.page_icon || '💡';

    // Extract text from block properties if children are empty
    const blockText = extractTextFromRichText(properties?.title);

    return (
        <aside
            className="callout my-4 rounded-lg border border-border p-4 bg-muted/30 flex items-start gap-3"
        >
            <span className="text-xl leading-6 select-none">{icon}</span>
            <div className="flex-1 min-w-0 text-foreground">
                {children || blockText || '(Empty callout)'}
            </div>
        </aside>
    );
};

// Custom Embed Component for Figma and other embeds
const CustomEmbed = ({ block }: { block: any }) => {
    const { format, properties } = block;

    // Get the embed URL from various possible locations
    let embedUrl =
        properties?.source?.[0]?.[0] ||
        format?.display_source ||
        format?.uri ||
        '';

    if (!embedUrl) {
        console.log('[NotionRenderer] Embed block has no URL:', block.type, JSON.stringify(format || {}).slice(0, 200));
        return null;
    }

    // Fix Figma URLs
    if (embedUrl.includes('figma.com') && !embedUrl.includes('embed_host')) {
        embedUrl = `https://www.figma.com/embed?embed_host=notion&url=${encodeURIComponent(embedUrl)}`;
    }

    return (
        <div className="my-4 w-full aspect-video">
            <iframe
                src={embedUrl}
                className="w-full h-full rounded-lg border border-border bg-muted"
                frameBorder="0"
                allowFullScreen
            />
        </div>
    );
};

// Helper to fix specific embed URLs (Figma and Google Maps)
const fixEmbedUrls = (recordMap: ExtendedRecordMap) => {
    if (!recordMap?.block) return recordMap;

    const newRecordMap = { ...recordMap };
    newRecordMap.block = { ...recordMap.block };

    Object.keys(newRecordMap.block).forEach((blockId) => {
        const blockWrapper = newRecordMap.block[blockId];
        if (!blockWrapper?.value) return;

        // Notion's API may double-wrap records as { value: { value, role } }.
        // Unwrap defensively so this works regardless of the API shape.
        const block: any = (blockWrapper.value as any)?.value ?? blockWrapper.value;
        const blockType = block.type;

        // Handle various embed block types including external_object_instance (used by Figma)
        if (blockType === 'embed' || blockType === 'figma' || blockType === 'maps' ||
            blockType === 'external_object_instance' || blockType === 'video') {

            const props = block.properties;
            const format = block.format as any; // Use 'any' for flexible Notion format structure

            // Check multiple locations for the URL
            let source =
                props?.source?.[0]?.[0] ||
                format?.display_source ||
                format?.uri ||
                format?.original_url;

            if (!source) return;

            let fixedUrl = source;
            let needsFix = false;

            // Fix Figma URLs
            if (source.includes('figma.com') && !source.includes('embed_host')) {
                fixedUrl = `https://www.figma.com/embed?embed_host=notion&url=${encodeURIComponent(source)}`;
                needsFix = true;
            }

            // Fix Google Maps URLs - convert standard maps URLs to embed format
            // Standard: https://www.google.com/maps/place/...
            // Embed: https://www.google.com/maps/embed?pb=... or /maps/embed/v1/...
            if (source.includes('google.com/maps') && !source.includes('/maps/embed')) {
                // Extract place/location data and create embed URL
                // For place URLs, we can use the "q" parameter approach
                try {
                    const url = new URL(source);
                    const pathParts = url.pathname.split('/');
                    const placeIndex = pathParts.indexOf('place');

                    if (placeIndex !== -1 && pathParts[placeIndex + 1]) {
                        // Extract place name
                        const placeName = decodeURIComponent(pathParts[placeIndex + 1].replace(/\+/g, ' '));
                        // Use embed format with place query
                        fixedUrl = `https://www.google.com/maps?q=${encodeURIComponent(placeName)}&output=embed`;
                        needsFix = true;
                    } else if (url.pathname.includes('@')) {
                        // Coordinate-based URL like /maps/@37.5668451,127.007578,17z
                        const coordMatch = url.pathname.match(/@([\d.-]+),([\d.-]+)/);
                        if (coordMatch) {
                            fixedUrl = `https://www.google.com/maps?q=${coordMatch[1]},${coordMatch[2]}&output=embed`;
                            needsFix = true;
                        }
                    } else {
                        // Fallback: just append output=embed for simple cases
                        fixedUrl = source.includes('?')
                            ? `${source}&output=embed`
                            : `${source}?output=embed`;
                        needsFix = true;
                    }
                } catch (e) {
                    console.log('[NotionRenderer] Failed to parse Google Maps URL:', source);
                }
            }

            if (needsFix) {
                // Mutate the block copy
                (newRecordMap.block as any)[blockId] = {
                    ...blockWrapper,
                    value: {
                        ...block,
                        format: {
                            ...(block.format || {}),
                            display_source: fixedUrl,
                        },
                        properties: {
                            ...(block.properties || {}),
                            source: [[fixedUrl]],
                        }
                    }
                };
            }
        }
    });

    return newRecordMap;
};


export function NotionPageRenderer({
    recordMap,
    rootPageId,
    fullPage = false,
    darkMode = false,
    previewImages = true,
    showCollectionViewDropdown = true,
    showTableOfContents = false,
    minTableOfContentsItems = 3,
    className = '',
}: NotionPageRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Fix URLs once
    const fixedRecordMap = useMemo(() => fixEmbedUrls(recordMap), [recordMap]);

    // Apply code syntax highlighting after render
    useEffect(() => {
        if (!containerRef.current) return;

        // Dynamically import Prism and highlight code blocks
        const highlightCode = async () => {
            try {
                // Import Prism dynamically to avoid SSR issues
                const Prism = (await import('prismjs')).default;

                // Import common languages
                await import('prismjs/components/prism-javascript');
                await import('prismjs/components/prism-typescript');
                await import('prismjs/components/prism-jsx');
                await import('prismjs/components/prism-tsx');
                await import('prismjs/components/prism-css');
                await import('prismjs/components/prism-python');
                await import('prismjs/components/prism-bash');
                await import('prismjs/components/prism-json');
                await import('prismjs/components/prism-yaml');
                await import('prismjs/components/prism-markdown');
                await import('prismjs/components/prism-sql');

                // Find all code blocks and apply highlighting
                const codeBlocks = containerRef.current?.querySelectorAll('pre code, .notion-code code');
                if (codeBlocks && codeBlocks.length > 0) {
                    codeBlocks.forEach((block) => {
                        Prism.highlightElement(block as HTMLElement);
                    });
                }
            } catch (error) {
                console.error('Failed to load Prism for syntax highlighting:', error);
            }
        };

        // Delay to ensure react-notion-x has rendered
        const timer = setTimeout(highlightCode, 500);
        return () => clearTimeout(timer);
    }, [fixedRecordMap]);

    if (!fixedRecordMap) {
        return null;
    }

    // Find external_object_instance blocks (Figma, etc.) that react-notion-x doesn't render
    const externalObjectBlocks = useMemo(() => {
        if (!fixedRecordMap?.block) return [];

        return Object.entries(fixedRecordMap.block)
            .filter(([_, blockWrapper]) => {
                const block = (blockWrapper as any)?.value;
                return block?.type === 'external_object_instance';
            })
            .map(([id, blockWrapper]) => {
                const block = (blockWrapper as any)?.value;
                const format = block?.format as any;

                // Extract embed URL from format
                let embedUrl = format?.uri || format?.display_source || format?.original_url || '';

                // Fix Figma URLs to use embed format
                if (embedUrl.includes('figma.com') && !embedUrl.includes('embed_host')) {
                    embedUrl = `https://www.figma.com/embed?embed_host=notion&url=${encodeURIComponent(embedUrl)}`;
                }

                return { id, embedUrl, block };
            })
            .filter(item => item.embedUrl);
    }, [fixedRecordMap]);

    return (
        <div ref={containerRef} className={`notion-renderer-wrapper ${className}`}>
            <NotionRenderer
                recordMap={fixedRecordMap}
                rootPageId={rootPageId}
                fullPage={fullPage}
                darkMode={darkMode}
                previewImages={previewImages}
                showCollectionViewDropdown={showCollectionViewDropdown}
                showTableOfContents={showTableOfContents}
                minTableOfContentsItems={minTableOfContentsItems}
                components={{
                    Code,
                    Collection,
                    Modal,
                    nextImage: Image,
                    nextLink: Link,
                    // Let react-notion-x handle Callout natively - styled via CSS
                }}
                mapPageUrl={(pageId) => `/blog/${pageId}`}
            />

            {/* Render external_object_instance blocks (Figma, etc.) that react-notion-x doesn't support */}
            {externalObjectBlocks.length > 0 && (
                <div className="external-embeds-section mt-6">
                    {externalObjectBlocks.map(({ id, embedUrl }) => (
                        <div key={id} className="my-6 w-full" style={{ aspectRatio: '16/9' }}>
                            <iframe
                                src={embedUrl}
                                className="w-full h-full rounded-xl border-0"
                                style={{ minHeight: '450px' }}
                                allowFullScreen
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default NotionPageRenderer;
