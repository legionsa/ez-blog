
import { NotionAPI } from 'notion-client';
import sanitizeHtml from 'sanitize-html';

// Create Notion client
const notion = new NotionAPI();

// Notion's unofficial API now double-wraps every record as
//   { value: { value: <record>, role } }
// instead of the historical single-nested shape
//   { role, value: <record> }
// The rest of this file (and react-notion-x) expects the single-nested shape,
// so without this normalization every block/collection lookup returns the
// wrapper object and zero posts/pages get extracted. This flattens the new
// shape back down while leaving the old shape untouched (forward/backward safe).
function normalizeRecordMap<T extends Record<string, any> | undefined | null>(recordMap: T): T {
    if (!recordMap) return recordMap;
    const tables = ['block', 'collection', 'collection_view', 'notion_user', 'space', 'comment', 'discussion'];
    for (const table of tables) {
        const group = (recordMap as any)[table];
        if (!group) continue;
        for (const id of Object.keys(group)) {
            const rec = group[id];
            // New shape: rec.value === { value: <record>, role }
            if (rec && rec.value && rec.value.value !== undefined && rec.value.role !== undefined) {
                rec.value = rec.value.value;
            }
        }
    }
    return recordMap;
}

// Wrapper around notion.getPage that always returns a normalized recordMap
async function getNotionRecordMap(pageId: string) {
    const recordMap = await notion.getPage(pageId);
    return normalizeRecordMap(recordMap as any);
}

// Cache duration in seconds (5 minutes)
const REVALIDATE_SECONDS = 300;

// In-memory cache
let postsCache: any[] | null = null;
let pagesCache: any[] | null = null;
let lastFetchTime: number = 0;

// Sanitize HTML config
const sanitizeConfig = {
    allowedTags: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'ul', 'ol', 'li',
        'blockquote', 'pre', 'code',
        'a', 'img',
        'strong', 'em', 'b', 'i', 'u', 's', 'del',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'div', 'span',
        'iframe', 'video', 'source', 'object', 'embed',
        'audio', 'aside', 'nav', 'details', 'summary',
        'figure', 'figcaption',
        'input', 'label', // For to-do checkboxes
        'script', // For Twitter/social embeds
        'button', // For copy buttons
        'noscript', // For fallback links
    ],
    allowedAttributes: {
        'a': ['href', 'title', 'target', 'rel'],
        'img': ['src', 'alt', 'width', 'height', 'loading'],
        'iframe': ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'style', 'class', 'scrolling', 'loading', 'referrerpolicy', 'webkitallowfullscreen', 'mozallowfullscreen'],
        'video': ['src', 'controls', 'width', 'height', 'poster', 'autoplay', 'loop', 'muted', 'playsinline'],
        'audio': ['src', 'controls', 'autoplay', 'loop', 'muted', 'preload'],
        'source': ['src', 'type'],
        'object': ['data', 'type', 'width', 'height'],
        'embed': ['src', 'type', 'width', 'height'],
        'details': ['open'],
        'input': ['type', 'checked', 'disabled', 'class'],
        'blockquote': ['class', 'cite'],
        'script': ['src', 'async', 'charset'],
        'button': ['onclick', 'class', 'type'],
        '*': ['class', 'id', 'style', 'aria-hidden'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: true,
    // Allow iframes from trusted sources (comprehensive list for Notion embeds)
    allowedIframeHostnames: [
        // Design & Prototyping
        'www.figma.com', 'figma.com',
        'www.canva.com', 'canva.com',
        'excalidraw.com',
        'www.sketch.com', 'sketch.com',
        'abstract.com', 'app.abstract.com',
        'invisionapp.com', 'www.invisionapp.com',
        'framer.com', 'www.framer.com',

        // Video
        'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',
        'player.vimeo.com', 'vimeo.com',
        'www.loom.com', 'loom.com',
        'www.dailymotion.com', 'dailymotion.com',

        // Audio
        'open.spotify.com', 'embed.spotify.com',
        'w.soundcloud.com', 'soundcloud.com',

        // Collaboration & Whiteboard
        'miro.com', 'www.miro.com',
        'whimsical.com', 'www.whimsical.com',
        'www.lucidchart.com', 'lucidchart.com',
        'mural.co', 'app.mural.co',

        // Google Services
        'www.google.com', 'maps.google.com', 'docs.google.com', 'drive.google.com',
        'calendar.google.com', 'sheets.google.com', 'slides.google.com',

        // Code & Development
        'codepen.io', 'gist.github.com', 'codesandbox.io',
        'replit.com', 'www.replit.com',
        'stackblitz.com',
        'jsfiddle.net',
        'github.com', 'www.github.com',
        'gitlab.com', 'www.gitlab.com',

        // Social
        'twitter.com', 'platform.twitter.com', 'publish.twitter.com',
        'www.instagram.com', 'instagram.com',
        'www.tiktok.com', 'tiktok.com',
        'www.linkedin.com', 'linkedin.com',

        // Forms & Surveys
        'typeform.com', 'www.typeform.com',
        'tally.so', 'www.tally.so',
        'airtable.com', 'www.airtable.com',
        'forms.gle',

        // Project Management
        'trello.com', 'www.trello.com',
        'asana.com', 'app.asana.com',
        'app.clickup.com', 'clickup.com',
        'notion.so', 'www.notion.so',
        'linear.app',
        'monday.com', 'www.monday.com',

        // Atlassian
        'jira.atlassian.com', 'atlassian.net',
        'confluence.atlassian.com',

        // Communication
        'zoom.us', 'www.zoom.us',
        'discord.com', 'www.discord.com',
        'slack.com', 'www.slack.com',

        // Documents & Storage
        'onedrive.live.com', 'www.dropbox.com', 'dropbox.com',
        'box.com', 'www.box.com',
        'evernote.com', 'www.evernote.com',

        // Support & CRM
        'zendesk.com', 'www.zendesk.com',
        'intercom.io', 'www.intercom.io',
        'hubspot.com', 'www.hubspot.com',

        // Misc
        'calendly.com', 'www.calendly.com',
        'pdf.js', // For PDF embedding
        'embed.diagrams.net', 'viewer.diagrams.net', // draw.io
    ],
};

// Helper to extract text from Notion properties
function extractText(textArray: any): string {
    if (!textArray) return '';
    if (typeof textArray === 'string') return textArray;
    if (Array.isArray(textArray)) {
        return textArray.map((item: any) => {
            if (typeof item === 'string') return item;
            if (Array.isArray(item) && item[0]) return item[0];
            return '';
        }).join('');
    }
    return '';
}

// oEmbed cache to avoid repeated API calls
const oEmbedCache: Record<string, string> = {};

// Helper to fetch oEmbed HTML for Spotify and SoundCloud
async function fetchOEmbedHtml(url: string): Promise<string | null> {
    // Check cache first
    if (oEmbedCache[url]) {
        return oEmbedCache[url];
    }

    try {
        let oEmbedUrl = '';

        // Spotify oEmbed
        if (url.includes('spotify.com')) {
            oEmbedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
        }
        // SoundCloud oEmbed
        else if (url.includes('soundcloud.com')) {
            oEmbedUrl = `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        }

        if (!oEmbedUrl) return null;

        const response = await fetch(oEmbedUrl);
        if (!response.ok) {
            console.log(`[oEmbed] Failed to fetch for ${url}: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data.html) {
            // Cache the result
            oEmbedCache[url] = data.html;
            return data.html;
        }

        return null;
    } catch (error) {
        console.error(`[oEmbed] Error fetching for ${url}:`, error);
        return null;
    }
}

// Pre-fetch oEmbed data for all Spotify/SoundCloud URLs in the recordMap
async function prefetchOEmbedData(recordMap: any): Promise<void> {
    if (!recordMap?.block) return;

    const urls: string[] = [];
    const blocks = recordMap.block;

    // Scan all blocks for Spotify/SoundCloud URLs
    for (const blockId in blocks) {
        const block = blocks[blockId]?.value;
        if (!block) continue;

        const { type, properties, format } = block;

        // Check audio blocks and embed blocks
        if (type === 'audio' || type === 'embed' || type === 'video') {
            const source = properties?.source?.[0]?.[0] || format?.display_source || format?.uri;
            if (source) {
                if (source.includes('spotify.com') || source.includes('soundcloud.com')) {
                    urls.push(source);
                }
            }
        }
    }

    // Fetch all oEmbed data in parallel
    if (urls.length > 0) {
        console.log(`[oEmbed] Pre-fetching ${urls.length} embed URLs...`);
        await Promise.all(urls.map(url => fetchOEmbedHtml(url)));
        console.log(`[oEmbed] Pre-fetch complete. Cache size: ${Object.keys(oEmbedCache).length}`);
    }
}

// Convert Notion blocks to HTML
function blocksToHtml(recordMap: any, pageId: string): string {
    if (!recordMap?.block) return '';

    const blocks = recordMap.block;
    let html = '';

    const processBlock = (blockId: string): string => {
        const block = blocks[blockId]?.value;
        if (!block) return '';

        const { type, properties, format } = block;

        switch (type) {
            case 'header':
            case 'heading_1':
                return `<h2>${extractText(properties?.title)}</h2>`;
            case 'sub_header':
            case 'heading_2':
                return `<h3>${extractText(properties?.title)}</h3>`;
            case 'sub_sub_header':
            case 'heading_3':
                return `<h4>${extractText(properties?.title)}</h4>`;
            case 'text':
            case 'paragraph':
                const text = extractText(properties?.title);
                return text ? `<p>${text}</p>` : '';
            case 'bulleted_list': {
                const itemText = extractText(properties?.title);
                let childrenHtml = '';
                if (block.content && block.content.length > 0) {
                    childrenHtml = '<ul class="ml-4">';
                    block.content.forEach((childId: string) => {
                        childrenHtml += processBlock(childId);
                    });
                    childrenHtml += '</ul>';
                }
                return `<ul class="list-disc ml-4 my-2"><li>${itemText}${childrenHtml}</li></ul>`;
            }
            case 'numbered_list': {
                const itemText = extractText(properties?.title);
                let childrenHtml = '';
                if (block.content && block.content.length > 0) {
                    childrenHtml = '<ol class="ml-4">';
                    block.content.forEach((childId: string) => {
                        childrenHtml += processBlock(childId);
                    });
                    childrenHtml += '</ol>';
                }
                return `<ol class="list-decimal ml-4 my-2"><li>${itemText}${childrenHtml}</li></ol>`;
            }
            case 'to_do': {
                const todoText = extractText(properties?.title);
                const checked = properties?.checked?.[0]?.[0] === 'Yes';
                return `<div class="flex items-start gap-2 my-1">
                    <input type="checkbox" ${checked ? 'checked' : ''} disabled class="mt-1 rounded" />
                    <span class="${checked ? 'line-through text-muted-foreground' : ''}">${todoText}</span>
                </div>`;
            }
            case 'quote':
                return `<blockquote>${extractText(properties?.title)}</blockquote>`;
            case 'code': {
                const codeText = extractText(properties?.title) || '';
                const language = properties?.language?.[0]?.[0] || format?.code_language || '';
                const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;

                return `<div class="code-block-wrapper relative my-4 rounded-lg overflow-hidden border border-border bg-[#1e1e1e]">
                    <div class="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-border">
                        <span class="text-xs text-muted-foreground font-mono">${language || 'Code'}</span>
                        <button 
                            onclick="navigator.clipboard.writeText(document.getElementById('${codeId}').textContent);this.innerHTML='Copied!';setTimeout(()=>this.innerHTML='Copy',2000)"
                            class="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >Copy</button>
                    </div>
                    <pre class="p-4 overflow-x-auto text-sm"><code id="${codeId}" class="language-${language.toLowerCase()}">${codeText}</code></pre>
                </div>`;
            }
            case 'image': {
                const imgSrc = format?.display_source || properties?.source?.[0]?.[0] || block?.source?.[0]?.[0];
                // Try multiple places for caption/alt text
                const imgCaption = extractText(properties?.caption) ||
                    extractText(format?.caption) ||
                    format?.block_caption ||
                    extractText(block?.caption) ||
                    '';
                return imgSrc ?
                    `<figure><img src="${imgSrc}" alt="${imgCaption}" />${imgCaption ? `<figcaption>${imgCaption}</figcaption>` : ''}</figure>`
                    : '';
            }
            case 'divider':
                return '<hr />';

            // --- Embed Support ---

            case 'video': {
                const source = properties?.source?.[0]?.[0] || format?.display_source;
                if (!source) return '';

                // YouTube/Vimeo (Standard Notion Embeds often come as "video" type)
                if (source.includes('youtube.com') || source.includes('youtu.be') || source.includes('vimeo.com')) {
                    // Convert standard Watch URLs to Embed URLs if needed
                    let embedUrl = source;
                    if (source.includes('youtube.com/watch?v=')) {
                        const videoId = source.split('v=')[1]?.split('&')[0];
                        embedUrl = `https://www.youtube.com/embed/${videoId}`;
                    } else if (source.includes('youtu.be/')) {
                        const videoId = source.split('youtu.be/')[1];
                        embedUrl = `https://www.youtube.com/embed/${videoId}`;
                    } else if (source.includes('vimeo.com/')) {
                        const videoId = source.split('vimeo.com/')[1];
                        embedUrl = `https://player.vimeo.com/video/${videoId}`;
                    }

                    return `<div class="aspect-video w-full my-4"><iframe src="${embedUrl}" class="w-full h-full rounded-lg" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
                }

                // Direct video file
                return `<video src="${source}" controls class="w-full rounded-lg my-4"></video>`;
            }

            case 'tweet': {
                const source = properties?.source?.[0]?.[0];
                if (!source) return '';
                return `<div class="my-4 flex justify-center"><blockquote class="twitter-tweet"><a href="${source}"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></div>`;
            }

            case 'bookmark': {
                const link = properties?.link?.[0]?.[0];
                const title = extractText(properties?.title) || link;
                const description = extractText(properties?.description);
                const cover = format?.bookmark_cover;

                return `
                    <a href="${link}" target="_blank" rel="noopener noreferrer" class="not-prose block my-4 overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-muted/50 no-underline">
                        <div class="flex h-full">
                            <div class="flex-1 p-4">
                                <div class="font-medium text-foreground line-clamp-1">${title}</div>
                                ${description ? `<div class="mt-1 text-sm text-muted-foreground line-clamp-2">${description}</div>` : ''}
                                <div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                    <span class="truncate">${link}</span>
                                </div>
                            </div>
                            ${cover ? `<div class="relative w-1/3 min-w-[120px] bg-muted"><img src="${cover}" alt="${title}" class="absolute inset-0 h-full w-full object-cover" /></div>` : ''}
                        </div>
                    </a>
                `;
            }

            case 'embed':
            case 'maps':
            case 'figma':
            case 'typeform':
            case 'codepen':
            case 'gist':
            case 'abstract':
            case 'invision':
            case 'framer':
            case 'whimsical':
            case 'mural':
            case 'loom': {
                // Try multiple possible locations for the embed URL
                // IMPORTANT: format.uri is used by Figma embeds!
                const source =
                    properties?.source?.[0]?.[0] ||
                    format?.display_source ||
                    format?.source ||
                    format?.uri ||
                    block?.source?.[0]?.[0] ||
                    properties?.link?.[0]?.[0];

                if (!source) {
                    console.log('[Notion] Embed block has no source:', type, JSON.stringify(format || {}).slice(0, 300));
                    return '';
                }

                let embedSrc = source;
                // Handle Figma specifically (including FigJam, Slides, etc.)
                if (source.includes('figma.com')) {
                    if (!source.includes('embed_host')) {
                        embedSrc = `https://www.figma.com/embed?embed_host=notion&url=${encodeURIComponent(source)}`;
                    }
                }

                // Generic iframe embed handling
                return `<div class="aspect-video w-full my-4"><iframe src="${embedSrc}" class="w-full h-full rounded-lg bg-muted" frameborder="0" allowfullscreen></iframe></div>`;
            }

            case 'drive':
            case 'google_drive': {
                const source = properties?.source?.[0]?.[0] || format?.display_source;
                if (!source) return '';
                return `<div class="w-full my-4"><iframe src="${source}" class="w-full h-[500px] rounded-lg border border-border" frameborder="0" allowfullscreen></iframe></div>`;
            }

            case 'pdf': {
                const source = properties?.source?.[0]?.[0] || format?.display_source;
                if (!source) return '';
                return `<div class="w-full h-[600px] my-4"><object data="${source}" type="application/pdf" class="w-full h-full rounded-lg border border-border"><p>Unable to display PDF file. <a href="${source}">Download</a> instead.</p></object></div>`;
            }

            case 'file': {
                const source = properties?.source?.[0]?.[0] || format?.display_source;
                const caption = extractText(properties?.caption) || source?.split('/').pop() || 'Download File';
                if (!source) return '';

                return `<a href="${source}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50 my-4"><span class="font-medium">${caption}</span></a>`;
            }

            // --- Audio Embeds (using oEmbed when available) ---
            case 'audio': {
                const source = properties?.source?.[0]?.[0] || format?.display_source;
                if (!source) return '';

                // Spotify - Try oEmbed first, fallback to link card
                if (source.includes('spotify.com')) {
                    // Check if we have cached oEmbed HTML
                    const cachedHtml = oEmbedCache[source];
                    if (cachedHtml) {
                        return `<div class="my-4">${cachedHtml}</div>`;
                    }
                    // Fallback to styled link card
                    return `<a href="${source}" target="_blank" rel="noopener noreferrer" class="block my-4 p-4 rounded-lg border border-border bg-[#1DB954] hover:bg-[#1ed760] transition-colors">
                        <div class="flex items-center gap-3 text-white">
                            <span class="text-3xl">🎵</span>
                            <div>
                                <p class="font-semibold">Listen on Spotify</p>
                                <p class="text-sm opacity-80">Click to open in Spotify</p>
                            </div>
                        </div>
                    </a>`;
                }

                // SoundCloud - Try oEmbed first, fallback to link card
                if (source.includes('soundcloud.com')) {
                    // Check if we have cached oEmbed HTML
                    const cachedHtml = oEmbedCache[source];
                    if (cachedHtml) {
                        return `<div class="my-4">${cachedHtml}</div>`;
                    }
                    // Fallback to styled link card
                    return `<a href="${source}" target="_blank" rel="noopener noreferrer" class="block my-4 p-4 rounded-lg border border-border bg-[#ff5500] hover:bg-[#ff7733] transition-colors">
                        <div class="flex items-center gap-3 text-white">
                            <span class="text-3xl">☁️</span>
                            <div>
                                <p class="font-semibold">Listen on SoundCloud</p>
                                <p class="text-sm opacity-80">Click to open in SoundCloud</p>
                            </div>
                        </div>
                    </a>`;
                }

                // Direct audio file
                return `<audio src="${source}" controls class="w-full my-4"></audio>`;
            }

            // --- Miro Boards ---
            case 'miro': {
                const source = properties?.source?.[0]?.[0] || format?.display_source;
                if (!source) return '';
                // Convert miro.com/app/board/xxx to embed URL
                let embedUrl = source;
                if (source.includes('miro.com/app/board/')) {
                    const boardId = source.split('board/')[1]?.split('?')[0];
                    embedUrl = `https://miro.com/app/embed/${boardId}`;
                }
                return `<div class="w-full my-4"><iframe src="${embedUrl}" width="100%" height="500" frameborder="0" scrolling="no" allow="fullscreen; clipboard-read; clipboard-write" allowfullscreen class="rounded-lg border border-border"></iframe></div>`;
            }

            // --- Excalidraw ---
            case 'excalidraw': {
                const source = properties?.source?.[0]?.[0] || format?.display_source;
                if (!source) return '';
                return `<div class="w-full my-4"><iframe src="${source}" width="100%" height="500" frameborder="0" class="rounded-lg border border-border bg-white"></iframe></div>`;
            }

            // --- Table of Contents ---
            case 'table_of_contents': {
                // Generate a static HTML TOC by scanning the recordMap
                const tocItems: { type: string; title: string; id: string; indent: number }[] = [];

                if (recordMap?.block) {
                    Object.values(recordMap.block).forEach((b: any) => {
                        const val = b?.value;
                        if (!val || val.parent_id !== pageId) return; // Only direct children of the page

                        const type = val.type;
                        if (['header', 'heading_1', 'sub_header', 'heading_2', 'sub_sub_header', 'heading_3'].includes(type)) {
                            const titleText = extractText(val.properties?.title);
                            if (titleText) {
                                let indent = 0;
                                if (type === 'sub_header' || type === 'heading_2') indent = 1;
                                if (type === 'sub_sub_header' || type === 'heading_3') indent = 2;

                                // Clean ID generation
                                const id = titleText
                                    .toLowerCase()
                                    .replace(/[^a-z0-9]+/g, '-')
                                    .replace(/(^-|-$)/g, '');

                                tocItems.push({ type, title: titleText, id, indent });
                            }
                        }
                    });
                }

                if (tocItems.length === 0) return '';

                // Keep order based on block order? 
                // Object.values doesn't guarantee order. We should rely on content array if possible.
                // Re-scanning via content array is safer.

                const orderedTocItems: { title: string; id: string; indent: number }[] = [];
                const pageContent = recordMap.block[pageId]?.value?.content || [];

                const processTocBlock = (blkId: string) => {
                    const val = recordMap.block[blkId]?.value;
                    if (!val) return;

                    const type = val.type;
                    if (['header', 'heading_1', 'sub_header', 'heading_2', 'sub_sub_header', 'heading_3'].includes(type)) {
                        const titleText = extractText(val.properties?.title);
                        if (titleText) {
                            let indent = 0;
                            if (type === 'sub_header' || type === 'heading_2') indent = 1;
                            if (type === 'sub_sub_header' || type === 'heading_3') indent = 2;
                            const id = titleText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                            orderedTocItems.push({ title: titleText, id, indent });
                        }
                    }

                    // Recurse for nested blocks (handling sections, column lists etc if they contain headers)
                    if (val.content) {
                        val.content.forEach((childId: string) => processTocBlock(childId));
                    }
                };

                pageContent.forEach((childId: string) => processTocBlock(childId));

                if (orderedTocItems.length === 0) return '';

                let tocHtml = '<nav class="my-6 p-4 rounded-lg border border-border bg-card"><p class="text-sm font-semibold mb-3">Table of Contents</p><ul class="space-y-1 text-sm">';
                orderedTocItems.forEach(item => {
                    const padding = item.indent * 16; // 0px, 16px, 32px
                    tocHtml += `<li><a href="#${item.id}" class="block text-muted-foreground hover:text-primary transition-colors" style="padding-left: ${padding}px">${item.title}</a></li>`;
                });
                tocHtml += '</ul></nav>';

                return tocHtml;
            }

            // --- Simple Tables ---
            case 'table': {
                // Check if this is a simple table (has table_row children) or a collection view
                const collectionId = format?.collection_id;
                if (collectionId) {
                    // Collection view - render placeholder
                    return `<div class="my-4 p-4 rounded-lg border border-border bg-muted/30 text-center"><p class="text-sm text-muted-foreground">📊 This content contains an embedded database.</p><p class="text-xs text-muted-foreground mt-1">View in Notion for the full interactive experience.</p></div>`;
                }

                // Simple table - render as HTML table
                const tableContent = block.content || [];
                if (tableContent.length === 0) return '';

                let tableHtml = '<div class="my-4 overflow-x-auto"><table class="w-full border-collapse border border-border rounded-lg overflow-hidden">';
                const hasColumnHeader = format?.table_block_column_header;
                const hasRowHeader = format?.table_block_row_header;

                tableContent.forEach((rowId: string, rowIndex: number) => {
                    const rowBlock = blocks[rowId]?.value;
                    if (!rowBlock || rowBlock.type !== 'table_row') return;

                    const cells = rowBlock.properties?.cells || [];
                    const isHeaderRow = hasColumnHeader && rowIndex === 0;

                    tableHtml += '<tr class="border-b border-border">';
                    cells.forEach((cell: any, cellIndex: number) => {
                        const cellText = extractText(cell) || '';
                        const isHeaderCell = isHeaderRow || (hasRowHeader && cellIndex === 0);
                        const cellTag = isHeaderCell ? 'th' : 'td';
                        const cellClass = isHeaderCell
                            ? 'bg-muted/50 p-3 text-left font-medium text-sm'
                            : 'p-3 text-sm';
                        tableHtml += `<${cellTag} class="${cellClass} border-r border-border last:border-r-0">${cellText}</${cellTag}>`;
                    });
                    tableHtml += '</tr>';
                });

                tableHtml += '</table></div>';
                return tableHtml;
            }

            // --- Collection Views (Databases) ---
            case 'collection_view':
            case 'collection_view_page': {
                // Notion databases are complex; we render a placeholder
                return `<div class="my-4 p-4 rounded-lg border border-border bg-muted/30 text-center"><p class="text-sm text-muted-foreground">📊 This content contains an embedded database.</p><p class="text-xs text-muted-foreground mt-1">View in Notion for the full interactive experience.</p></div>`;
            }

            // --- Callout (enhanced) ---
            case 'callout': {
                // Callout text can be in title, or might need to process children
                let text = extractText(properties?.title);
                const icon = format?.page_icon || '💡';
                const color = format?.block_color || 'gray_background';

                // If no text in title, check if callout has child blocks
                if (!text && block.content && block.content.length > 0) {
                    let childrenHtml = '';
                    block.content.forEach((childId: string) => {
                        childrenHtml += processBlock(childId);
                    });
                    return `<aside class="callout my-4 rounded-lg border border-border p-4 bg-muted/30" style="display: flex; align-items: flex-start; gap: 12px;"><span style="font-size: 1.25rem; line-height: 1.5;">${icon}</span><div style="flex: 1; min-width: 0;">${childrenHtml}</div></aside>`;
                }

                // Debug: Log if text is empty
                if (!text) {
                    console.log('[Notion] Callout has no text. Properties:', JSON.stringify(properties || {}).slice(0, 300));
                }

                return `<aside class="callout my-4 rounded-lg border border-border p-4 bg-muted/30" style="display: flex; align-items: flex-start; gap: 12px;"><span style="font-size: 1.25rem; line-height: 1.5;">${icon}</span><div style="flex: 1; min-width: 0;">${text || '(Empty callout)'}</div></aside>`;
            }

            // --- Block Equation ---
            case 'equation': {
                const expression = properties?.title?.[0]?.[0] || '';
                return `<div class="my-4 p-4 bg-muted/50 rounded-lg text-center font-mono overflow-x-auto">${expression}</div>`;
            }

            // --- Link to Page / Page Mention ---
            case 'link_to_page':
            case 'alias': {
                const linkedPageId = format?.alias_pointer?.id || block.page_id || '';
                const linkedPage = blocks[linkedPageId]?.value;
                const pageTitle = extractText(linkedPage?.properties?.title) || 'Linked Page';
                const pageIcon = linkedPage?.format?.page_icon || '📄';
                // Create a styled link that will open in new tab with external link styling
                return `<a href="https://notion.so/${linkedPageId.replace(/-/g, '')}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 my-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-sm">
                    <span>${pageIcon}</span>
                    <span>${pageTitle}</span>
                    <span class="text-muted-foreground">↗</span>
                </a>`;
            }

            // --- Synced Block (transclusion) ---
            case 'transclusion_container':
            case 'transclusion_reference': {
                // Process synced block children
                let syncedContent = '';
                if (block.content) {
                    block.content.forEach((childId: string) => {
                        syncedContent += processBlock(childId);
                    });
                }
                return syncedContent;
            }

            // --- Breadcrumb (skip - not meaningful in blog) ---
            case 'breadcrumb': {
                return '';
            }

            // --- Toggle (collapsible with children) ---
            case 'toggle': {
                const title = extractText(properties?.title);
                let childrenHtml = '';
                if (block.content && block.content.length > 0) {
                    block.content.forEach((childId: string) => {
                        childrenHtml += processBlock(childId);
                    });
                }
                return `<details class="my-4 rounded-lg border border-border p-4 bg-card">
                    <summary class="font-medium cursor-pointer">${title}</summary>
                    <div class="mt-2 pl-4">${childrenHtml || '<p class="text-muted-foreground text-sm">Empty toggle</p>'}</div>
                </details>`;
            }

            // --- Multi-Column Layouts ---
            case 'column_list': {
                const columns = block.content || [];
                if (columns.length === 0) return '';

                let columnsHtml = '';
                columns.forEach((colId: string) => {
                    const colBlock = blocks[colId]?.value;
                    let colContent = '';
                    if (colBlock?.content) {
                        colBlock.content.forEach((childId: string) => {
                            colContent += processBlock(childId);
                        });
                    }
                    columnsHtml += `<div class="flex-1 min-w-0">${colContent}</div>`;
                });
                return `<div class="flex flex-col md:flex-row gap-4 my-4">${columnsHtml}</div>`;
            }
            case 'column': {
                // Handled by column_list parent
                return '';
            }

            default: {
                // Log unknown block types for debugging
                if (type && type !== 'page') {
                    console.log('[Notion] Unknown block type:', type, 'Properties:', JSON.stringify(properties || {}).slice(0, 200), 'Format:', JSON.stringify(format || {}).slice(0, 200));
                }

                // Try to extract an embed source from unknown types
                // IMPORTANT: Check format.uri too - this is where Figma URLs are stored!
                const source = properties?.source?.[0]?.[0] || format?.display_source || format?.uri;
                if (source && (source.startsWith('http://') || source.startsWith('https://'))) {
                    // Check if it's a Figma URL
                    if (source.includes('figma.com')) {
                        const embedSrc = source.includes('embed_host')
                            ? source
                            : `https://www.figma.com/embed?embed_host=notion&url=${encodeURIComponent(source)}`;
                        return `<div class="aspect-video w-full my-4"><iframe src="${embedSrc}" class="w-full h-full rounded-lg bg-muted" frameborder="0" allowfullscreen></iframe></div>`;
                    }

                    // Google Maps - Use embed API
                    if (source.includes('google.com/maps') || source.includes('maps.google.com') || source.includes('goo.gl/maps')) {
                        // For Google Maps embed to work, need to use Maps Embed API format
                        // Show as a styled link card since Maps often blocks embedding
                        return `<a href="${source}" target="_blank" rel="noopener noreferrer" class="block my-4 p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors">
                            <div class="flex items-center gap-3">
                                <span class="text-2xl">📍</span>
                                <div>
                                    <p class="font-medium">View on Google Maps</p>
                                    <p class="text-sm text-muted-foreground">Click to open map in new tab</p>
                                </div>
                            </div>
                        </a>`;
                    }

                    // Twitter/X - Use styled link card (script embedding unreliable in sanitized HTML)
                    if (source.includes('twitter.com') || source.includes('x.com')) {
                        return `<a href="${source}" target="_blank" rel="noopener noreferrer" class="block my-4 p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors">
                            <div class="flex items-center gap-3">
                                <span class="text-2xl">𝕏</span>
                                <div>
                                    <p class="font-medium">View Post on X (Twitter)</p>
                                    <p class="text-sm text-muted-foreground">Click to view the original post</p>
                                </div>
                            </div>
                        </a>`;
                    }

                    // Spotify - Link card (embedding blocked from third-party sites)
                    if (source.includes('spotify.com')) {
                        return `<a href="${source}" target="_blank" rel="noopener noreferrer" class="block my-4 p-4 rounded-lg border border-border bg-[#1DB954] hover:bg-[#1ed760] transition-colors">
                            <div class="flex items-center gap-3 text-white">
                                <span class="text-3xl">🎵</span>
                                <div>
                                    <p class="font-semibold">Listen on Spotify</p>
                                    <p class="text-sm opacity-80">Click to open in Spotify</p>
                                </div>
                            </div>
                        </a>`;
                    }

                    // SoundCloud - Link card (embedding blocked from third-party sites)
                    if (source.includes('soundcloud.com')) {
                        return `<a href="${source}" target="_blank" rel="noopener noreferrer" class="block my-4 p-4 rounded-lg border border-border bg-[#ff5500] hover:bg-[#ff7733] transition-colors">
                            <div class="flex items-center gap-3 text-white">
                                <span class="text-3xl">☁️</span>
                                <div>
                                    <p class="font-semibold">Listen on SoundCloud</p>
                                    <p class="text-sm opacity-80">Click to open in SoundCloud</p>
                                </div>
                            </div>
                        </a>`;
                    }

                    // Loom video
                    if (source.includes('loom.com')) {
                        const embedUrl = source.replace('share', 'embed');
                        return `<div class="aspect-video w-full my-4"><iframe src="${embedUrl}" class="w-full h-full rounded-lg" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>`;
                    }

                    // Generic fallback for other embeds
                    return `<div class="aspect-video w-full my-4"><iframe src="${source}" class="w-full h-full rounded-lg bg-muted" frameborder="0" allowfullscreen></iframe></div>`;
                }
                return '';
            }
        }
    };

    // Get page block and its content
    const pageBlock = blocks[pageId]?.value;
    console.log('[blocksToHtml] Processing page:', pageId, '| Content blocks:', pageBlock?.content?.length || 0);

    if (pageBlock?.content) {
        for (const childId of pageBlock.content) {
            const blockInfo = blocks[childId]?.value;
            console.log('[blocksToHtml] Block:', childId.slice(0, 8), '| Type:', blockInfo?.type, '| Has format.uri:', !!blockInfo?.format?.uri);
            html += processBlock(childId);
        }
    }

    console.log('[blocksToHtml] Final HTML length:', html.length, '| Contains figma:', html.includes('figma'));
    return sanitizeHtml(html, sanitizeConfig);
}

// Extract database rows from Notion record map
function extractDatabaseRows(recordMap: any): any[] {
    const rows: any[] = [];

    if (!recordMap?.collection || !recordMap?.block) {
        return rows;
    }

    const collectionId = Object.keys(recordMap.collection)[0];
    const collection = recordMap.collection[collectionId]?.value;
    const schema = collection?.schema || {};

    for (const [blockId, blockData] of Object.entries(recordMap.block)) {
        const block = (blockData as any)?.value;
        if (!block || block.type !== 'page' || block.parent_table !== 'collection') {
            continue;
        }

        const properties = block.properties || {};
        const row: any = {
            id: blockId,
            properties: {}
        };

        for (const [propId, propDef] of Object.entries(schema)) {
            const def = propDef as any;
            const value = properties[propId];
            const propName = def.name?.toLowerCase();

            if (!propName) continue;

            switch (def.type) {
                case 'title':
                    row.properties.title = extractText(value);
                    break;
                case 'text':
                case 'rich_text':
                    row.properties[propName] = extractText(value);
                    break;
                case 'select':
                    if (value && value[0]) {
                        row.properties[propName] = value[0][0] || '';
                    }
                    break;
                case 'multi_select':
                    if (value && value[0]) {
                        row.properties[propName] = value[0][0]?.split(',').map((t: string) => t.trim()) || [];
                    }
                    break;
                case 'date':
                    if (value && value[0] && value[0][1]) {
                        const dateData = value[0][1][0];
                        row.properties[propName] = dateData?.[1]?.start_date || null;
                    }
                    break;
                case 'checkbox':
                    row.properties[propName] = value?.[0]?.[0] === 'Yes';
                    break;
                case 'url':
                    row.properties[propName] = value?.[0]?.[0] || '';
                    break;
                case 'file':
                    if (value?.[0]?.[1]?.[0]?.[1]) {
                        row.properties[propName] = value[0][1][0][1];
                    }
                    break;
                case 'created_by':
                case 'last_edited_by':
                case 'person':
                    // Extract user name from person/created_by property
                    // Format can be: [[user_id, [["p", user_id, "notion_user"]]]]
                    // or stored in recordMap.notion_user
                    if (value?.[0]?.[1]?.[0]) {
                        const userRef = value[0][1][0];
                        if (userRef[0] === 'p' && userRef[1]) {
                            const userId = userRef[1];
                            // Try to get user from recordMap
                            const notionUsers = recordMap.notion_user || {};
                            const userRecord = (notionUsers as any)[userId]?.value;
                            if (userRecord) {
                                row.properties[propName] = userRecord.name || userRecord.given_name || 'Unknown';
                                // Also store avatar if available
                                if (userRecord.profile_photo) {
                                    row.properties[`${propName}_avatar`] = userRecord.profile_photo;
                                }
                            } else {
                                row.properties[propName] = 'Author';
                            }
                        }
                    } else if (block.created_by_id && def.type === 'created_by') {
                        // Fallback: try block.created_by_id
                        const userId = block.created_by_id;
                        const notionUsers = recordMap.notion_user || {};
                        const userRecord = (notionUsers as any)[userId]?.value;
                        if (userRecord) {
                            row.properties[propName] = userRecord.name || userRecord.given_name || 'Unknown';
                            if (userRecord.profile_photo) {
                                row.properties[`${propName}_avatar`] = userRecord.profile_photo;
                            }
                        }
                    }
                    break;
            }
        }

        // Always extract system-level "Created by" from the block metadata
        // This handles Notion's automatic "Created by" column (system property)
        if (!row.properties['created by'] && block.created_by_id) {
            const userId = block.created_by_id;
            const notionUsers = recordMap.notion_user || {};
            const userRecord = (notionUsers as any)[userId]?.value;
            if (userRecord) {
                row.properties['created by'] = userRecord.name || userRecord.given_name || '';
                if (userRecord.profile_photo) {
                    row.properties['created by_avatar'] = userRecord.profile_photo;
                }
                console.log('[Notion] Extracted system created_by:', row.properties['created by']);
            }
        }

        // Debug log to trace row extraction
        console.log('[Notion ExtractRow]', row.properties.title ? `OK: ${row.properties.title}` : `FILTERED: No title found, raw props: ${JSON.stringify(Object.keys(properties))}`);

        if (row.properties.title) {
            rows.push(row);
        }
    }

    console.log('[Notion ExtractRows] Total rows extracted:', rows.length);
    return rows;
}

// Internal Fetch Content (Uncached execution)
export async function fetchNotionData(pageUrl: string) {
    // Extract page ID from URL
    const urlParts = pageUrl.split('/').pop()?.split('-') || [];
    let pageId = urlParts[urlParts.length - 1] || '';

    if (pageId.length === 32) {
        pageId = `${pageId.slice(0, 8)}-${pageId.slice(8, 12)}-${pageId.slice(12, 16)}-${pageId.slice(16, 20)}-${pageId.slice(20)}`;
    }

    const recordMap = await getNotionRecordMap(pageId);
    const hasCollection = recordMap?.collection && Object.keys(recordMap.collection).length > 0;

    if (!hasCollection) {
        // Single page
        const block = recordMap?.block?.[pageId]?.value;
        const title = extractText(block?.properties?.title) || 'Untitled';

        // Pre-fetch oEmbed data for Spotify/SoundCloud
        await prefetchOEmbedData(recordMap);

        const content = blocksToHtml(recordMap, pageId);
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        return {
            posts: [{
                notionId: pageId,
                title,
                slug,
                excerpt: '',
                content,
                coverImage: block?.format?.page_cover || '',
                tags: [],
                status: 'published',
                publishedAt: new Date().toISOString(),
                contentType: 'post',
            }],
            pages: [],
        };
    }

    // Database
    const rows = extractDatabaseRows(recordMap);
    const items = await Promise.all(
        rows.map(async (row) => {
            try {
                console.log('[Notion] Fetching page content for:', row.id, '| Title:', row.properties?.title);
                const pageRecordMap = await getNotionRecordMap(row.id);

                if (!pageRecordMap?.block) {
                    console.log('[Notion] No block data for page:', row.id);
                }

                let content = '';
                try {
                    // Pre-fetch oEmbed data for Spotify/SoundCloud
                    await prefetchOEmbedData(pageRecordMap);

                    content = blocksToHtml(pageRecordMap, row.id);
                } catch (htmlError: any) {
                    console.error('[Notion] blocksToHtml error for:', row.id, '| Error:', htmlError?.message, '| Stack:', htmlError?.stack?.slice(0, 300));
                    content = '<p>Content could not be loaded</p>';
                }

                const props = row.properties;

                const title = props.title || 'Untitled';

                const slug = props.slug || props.url || props.permalink ||
                    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

                const typeValue = String(props.type || props.contenttype || props['content type'] || 'post').toLowerCase();
                const contentType = typeValue === 'page' ? 'page' : 'post';

                const statusValue = String(props.status || '').toLowerCase();
                const isPublished = statusValue === 'published' || props.published === true;

                // Debug log to trace content processing
                console.log('[Notion Debug]', title, '| Type:', typeValue, '| Status:', statusValue, '| Published:', isPublished, '| ContentType:', contentType);

                const excerpt = props.summary || props.excerpt || props.description ||
                    props.subtitle || props.intro || '';

                let tags = props.tags || props.categories || props.labels || [];
                if (typeof tags === 'string') {
                    tags = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
                }

                const publishedAt = props.date || props.published_date || props.publishedat ||
                    props['publish date'] || props.created || null;

                const coverImage = props['hero image'] || props['heroimage'] || props['hero_image'] ||
                    props.cover || props.image || props.thumbnail || props.banner || '';

                const heroSizeValue = String(
                    props['hero size'] ||
                    props['Hero Size'] ||
                    props['herosize'] ||
                    props['hero_size'] ||
                    props['HeroSize'] ||
                    ''
                ).toLowerCase();
                const coverImageSize = heroSizeValue === 'big' ? 'big' : heroSizeValue === 'small' ? 'small' : undefined;

                // Extract Hero ALT Text
                const coverImageAlt = props['hero alt text'] || props['hero alt'] ||
                    props['heroalttext'] || props['hero_alt_text'] ||
                    props['alt text'] || props['alttext'] || '';

                // Extract Author from 'Created by' or 'Author' property
                const authorName = props['created by'] || props['createdby'] ||
                    props['created_by'] || props['author'] || '';
                const authorAvatar = props['created by_avatar'] || props['createdby_avatar'] ||
                    props['created_by_avatar'] || props['author_avatar'] || '';

                return {
                    notionId: row.id,
                    title,
                    slug,
                    excerpt,
                    content,
                    coverImage,
                    coverImageSize,
                    coverImageAlt,
                    tags,
                    status: isPublished ? 'published' : 'draft',
                    publishedAt,
                    contentType,
                    // Author from Notion
                    authorName: authorName || undefined,
                    authorAvatar: authorAvatar || undefined,
                };
            } catch (e: any) {
                console.error('[Notion Error] Failed to process row:', row.id, '| Title:', row.properties?.title, '| Error:', e?.message || e);
                return null;
            }
        })
    );

    const validItems = items.filter(Boolean);
    return {
        posts: validItems.filter((item: any) => item.contentType === 'post'),
        pages: validItems.filter((item: any) => item.contentType === 'page'),
    };
}

// Fetch and cache Notion content
export async function fetchNotionContent() {
    const pageUrl = process.env.NOTION_PAGE_URL;
    if (!pageUrl) {
        return { posts: [], pages: [], source: 'none' };
    }

    const now = Date.now();
    const cacheAge = (now - lastFetchTime) / 1000;

    if (postsCache && pagesCache && cacheAge < REVALIDATE_SECONDS) {
        return {
            posts: postsCache,
            pages: pagesCache,
            source: 'cache',
            cacheAge,
        };
    }

    try {
        const { posts, pages } = await fetchNotionData(pageUrl);
        postsCache = posts;
        pagesCache = pages;
        lastFetchTime = now;

        return {
            posts,
            pages,
            source: 'notion',
        };
    } catch (error) {
        console.error('Notion fetch error:', error);
        if (postsCache && pagesCache) {
            return {
                posts: postsCache,
                pages: pagesCache,
                source: 'stale-cache',
                error
            };
        }
        throw error;
    }
}

// Helper for Server Components to get all posts
export async function getNotionPosts() {
    const { posts } = await fetchNotionContent();
    return posts;
}

// Helper for Server Components to get a specific page recordMap
export async function getNotionPage(pageId: string) {
    const recordMap = await notion.getPage(pageId);
    return normalizeRecordMap(recordMap as any);
}
