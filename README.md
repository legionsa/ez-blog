# ✍️ ezBlog

**A Notion-Powered Blog with Zero Config**

Write in Notion, see it on your blog instantly. Fork, deploy to Vercel, and you're live.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

### ⚡ Lighthouse Scores

| Performance | Accessibility | Best Practices | SEO |
|:-----------:|:-------------:|:--------------:|:---:|
| 🟢 97 | 🟢 100 | 🟢 100 | 🟢 100 |

🔗 **[Live Demo](https://ez-blog-demo.vercel.app/)** | 📖 [Documentation](#-configuration) | 🚀 [Quick Start](#-quick-start)

---

## 🎯 Why ezBlog?

| Feature | Description |
|---------|-------------|
| ✅ **Notion-First** | Write in Notion, auto-sync to blog |
| 📊 **Vercel Analytics** | Built-in page views and visitors |
| 💬 **GitHub Comments** | Giscus integration for discussions |
| 🖼️ **Dynamic OG Images** | Auto-generated social preview images |
| 🔄 **ISR Caching** | Fast loads with 1-hour revalidation |
| 🆓 **Free Hosting** | Deploy on Vercel for free |

---

## ⚡ Quick Start

### 1. Fork & Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/legionsa/ezBlog)

### 2. Configure Environment Variables

In Vercel → Settings → Environment Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTION_PAGE_URL` | ✅ | Your Notion database URL (server-side) |
| `ADMIN_PASSWORD` | ✅ | Admin dashboard password (server-side) |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Your site URL (e.g., `https://yourblog.com`) |
| `NEXT_PUBLIC_SITE_TITLE` | | Site title (default: `ezBlog`) |

### 3. Done!

Your blog is live. Content syncs from Notion automatically.

---

## 🔧 Configuration

Copy `.env.example` to `.env.local` for local development.

### Site Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_SITE_TITLE` | Site title | `ezBlog` |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | Site description | — |
| `NEXT_PUBLIC_SITE_URL` | Full URL for SEO/RSS | — |

### Author

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_AUTHOR_NAME` | Author name | `Admin` |
| `NEXT_PUBLIC_AUTHOR_BIO` | Author bio | — |
| `NEXT_PUBLIC_AUTHOR_AVATAR` | Avatar URL | `/avatar.svg` |

### Comments (Giscus - Server-Side)

Get values from [giscus.app](https://giscus.app). These are **server-side** variables:

| Variable | Description |
|----------|-------------|
| `GISCUS_REPO` | `username/repo-name` |
| `GISCUS_REPO_ID` | Repository ID |
| `GISCUS_CATEGORY` | Category name |
| `GISCUS_CATEGORY_ID` | Category ID |

> **🔒 Security Note**: Giscus variables are server-side only (no `NEXT_PUBLIC_` prefix) for better abstraction.

### Notion & Admin Security

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_PASSWORD` | Admin dashboard password (server-side only) | `admin123` |

> **⚠️ Security Note**: `ADMIN_PASSWORD` and `NOTION_PAGE_URL` are **server-side** variables (no `NEXT_PUBLIC_` prefix). They are never exposed to browsers. Change the default password immediately in production.

### 🔄 Migration Guide (For Existing Users)

If you're upgrading from an older version, rename these environment variables:

| **Old Variable (Insecure)** | **New Variable (Secure)** |
|----------------------------|---------------------------|
| `NEXT_PUBLIC_ADMIN_PASSWORD` | `ADMIN_PASSWORD` |
| `NEXT_PUBLIC_NOTION_PAGE_URL` | `NOTION_PAGE_URL` |
| `NEXT_PUBLIC_GISCUS_REPO` | `GISCUS_REPO` |
| `NEXT_PUBLIC_GISCUS_REPO_ID` | `GISCUS_REPO_ID` |
| `NEXT_PUBLIC_GISCUS_CATEGORY` | `GISCUS_CATEGORY` |
| `NEXT_PUBLIC_GISCUS_CATEGORY_ID` | `GISCUS_CATEGORY_ID` |

**Steps:**
1. **Vercel**: Dashboard → Settings → Environment Variables → Delete old vars → Add new ones → Redeploy
2. **Local**: Update `.env.local` with new names → Restart dev server

---

## 🔗 Notion Setup

### 1. Create Database
Duplicate this database [Notion Template](https://hikalvin.notion.site/2db27bd11ca0814eae88d120ff46fbf5?v=2db27bd11ca08102b9f5000cf7f5bf97&source=copy_link). 


Or you can create a Notion database with these properties:

| Property | Type | Description |
|----------|------|-------------|
| `Title` | Title | Post title |
| `Slug` | Text | URL slug (or auto-generated from title) |
| `Status` | Select | `Published` or `Draft` |
| `Type` | Select | `Post` or `Page` |
| `Tags` | Multi-select | Categories/tags |
| `Summary` | Text | Excerpt for previews |
| `Hero Image` | URL | Cover image |
| `Date` | Date | Publish date |

### 2. Share Publicly

1. Click **Share** → Enable **Share to web**
2. Copy the public URL
3. Set as `NEXT_PUBLIC_NOTION_PAGE_URL`

### Supported Blocks

| Category | Blocks |
|----------|--------|
| **Text** | Paragraphs, Headings, Quote, Callout, Toggle, Divider |
| **Lists** | Bulleted, Numbered, To-do |
| **Media** | Images, Video, Audio, PDF |
| **Embeds** | Figma, YouTube, Spotify, CodePen, Miro, 70+ more |
| **Layout** | Columns, Table of Contents |
| **Advanced** | Equations, Code blocks with syntax highlighting |

---

## 📈 Features

### Vercel Analytics

Free, zero-config analytics. Just enable in Vercel Dashboard → Analytics.

### Dynamic OG Images

Auto-generated social preview images at `/api/og?title=...`

### RSS Feed

Available at `/feed.xml` — auto-generated from Notion posts.

### Sitemap

Available at `/sitemap.xml` — includes all published posts and pages.

---

## 🎨 Theming

ezBlog uses **Tailwind CSS v4** with CSS variables for theming. This makes it very easy to customize the look and feel of your blog by simply editing the CSS variables in `src/app/globals.css`.

### How to Customize

Open `src/app/globals.css`. You will see a `:root` block for light mode and a `.dark` block for dark mode.

#### 1. Light Mode Colors

Edit the variables in the `:root` selector:

```css
:root {
  /* Background color of the page */
  --background: oklch(1 0 0); 
  
  /* Main text color */
  --foreground: oklch(0.145 0 0); 

  /* Primary brand color (used for buttons, links, highlights) */
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0); /* Text on top of primary color */

  /* Secondary color (used for muted elements, secondary buttons) */
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
}
```

#### 2. Dark Mode Colors

Edit the variables in the `.dark` selector:

```css
.dark {
  /* Dark mode background */
  --background: oklch(0.145 0 0);
  
  /* Dark mode text */
  --foreground: oklch(0.985 0 0); 
}
```

### Fonts

Fonts are configured in `src/app/layout.tsx` using `next/font`. To change them:
1. Import a font from `next/font/google` in `layout.tsx`.
2. Update the CSS variable definition in `src/app/globals.css`.

---

## 📐 Creating Templates

ezBlog is a Next.js application, so "templates" are effectively React components. You can customize the layout of the home page (post list) and individual blog posts by modifying the respective page components.

### 1. Home Page Template (Post List)

The home page layout is defined in `src/app/page.tsx` and `src/app/home-client.tsx`.

To change how posts are displayed (e.g., switching from Grid to List view), edit `src/app/home-client.tsx`.

**Example: Switch to a Vertical List Layout**

Change the grid loop:

```tsx
<div className="flex flex-col gap-6 max-w-2xl mx-auto">
  {filteredPosts.map((post) => (
    <div key={post.id} className="flex gap-4 border-b pb-4">
       {/* Custom list item design */}
       <img src={post.coverImage} className="w-24 h-24 object-cover rounded" />
       <div>
         <h2 className="text-xl font-bold">{post.title}</h2>
         <p>{post.excerpt}</p>
       </div>
    </div>
  ))}
</div>
```

### 2. Blog Post Template

Individual blog posts are rendered by `src/app/blog/[slug]/page.tsx`.

To change the design of the post header (title, author, date, cover image), edit the `return` statement in `page.tsx`.

**Example: Full-Width Hero Image Layout**

```tsx
return (
  <article>
    {/* Full width hero */}
    <div className="w-full h-[50vh] relative">
      <Image src={post.coverImage} fill className="object-cover" />
      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
        <h1 className="text-white text-5xl font-bold">{post.title}</h1>
      </div>
    </div>

    {/* Content Container */}
    <div className="container py-10 max-w-3xl mx-auto">
      <NotionRenderer recordMap={recordMap} />
    </div>
  </article>
)
```

---

## 🔄 Migration Guide (For Existing Users)

If you're updating from an older version of ezBlog, you need to rename some environment variables for improved security:

### Environment Variable Changes

| Old Variable (INSECURE) | New Variable (SECURE) | Notes |
|------------------------|----------------------|-------|
| `NEXT_PUBLIC_ADMIN_PASSWORD` | `ADMIN_PASSWORD` | Was exposed to clients! |
| `NEXT_PUBLIC_NOTION_PAGE_URL` | `NOTION_PAGE_URL` | Now server-side only |

### Migration Steps

**1. Update Variables in Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - **Delete**: `NEXT_PUBLIC_ADMIN_PASSWORD`
   - **Delete**: `NEXT_PUBLIC_NOTION_PAGE_URL`
   - **Add**: `ADMIN_PASSWORD` with your password value
   - **Add**: `NOTION_PAGE_URL` with your Notion database URL

**2. Update Local `.env.local`** (if developing locally):
   ```bash
   # OLD (remove these)
   NEXT_PUBLIC_ADMIN_PASSWORD=yourpassword
   NEXT_PUBLIC_NOTION_PAGE_URL=https://notion.so/your-page

   # NEW (use these instead)
   ADMIN_PASSWORD=yourpassword
   NOTION_PAGE_URL=https://notion.so/your-page
   ```

**3. Deploy:**
   ```bash
   git pull  # Get latest code
   git push  # Trigger Vercel deployment
   ```

**Why This Matters:**
- **Before**: Your admin password and Notion URL were visible in browser source code
- **After**: Both are server-side only and never exposed to visitors

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js 16 | React framework with App Router |
| TypeScript | Type safety |
| Tailwind CSS 4 | Styling |
| shadcn/ui | UI components |
| react-notion-x | Notion renderer |
| Giscus | GitHub-based comments |

---

## 🏃 Run Locally

```bash
git clone https://github.com/legionsa/ezBlog.git
cd ezBlog
npm install
cp .env.example .env.local  # Edit with your values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## � Future Roadmap

Planned features and improvements:

### Performance & Scalability
- **Pagination / Load More**: The home page currently loads all posts at once. Adding a "Load More" button or full pagination will be crucial for performance as your blog grows and you have 50+ posts.

### Audience Growth
- **Newsletter Subscription**: A clean, customizable UI component for email capture that can be easily integrated with popular services like Mailchimp, ConvertKit, or Substack.

### Enhanced Search
- **Dedicated Search Page**: A dedicated `/search` route with shareable URLs (e.g., `/search?q=react`) for better SEO and the ability to link directly to search results.

> **Want to contribute?** These features are open for community contributions! Check the [GitHub repository](https://github.com/legionsa/ezBlog) for issues and pull requests.

---

## 📝 Changelog

### v1.0.3
- **Fix:** Blog showed no posts (homepage stuck on loading skeleton, empty RSS feed). Notion's unofficial API changed to double-nest every record (`{ value: { value, role } }` instead of `{ role, value }`), which broke post/page extraction in `src/lib/notion.ts`. Added a `normalizeRecordMap()` step at every `getPage()` call so records are flattened back to the expected shape (backward-compatible with the old shape).

### v1.0.2
- Added a Notion template so users don't need to create the database manually.
- Smoother scrolling post progress indicator.

### v1.0.1
- Security: moved admin auth and sensitive env vars to server-side.
- Removed Unsplash and Tiptap dependencies; updated Giscus variables.
- Various Notion status rendering fixes (CMS and post view).

### v1.0.0
- Initial release: headless Notion-powered blog with theming and templating.

---

## �📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

**Made with ❤️ for writers who love Notion.**
