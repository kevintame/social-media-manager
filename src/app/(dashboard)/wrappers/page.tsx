import Link from "next/link";
import { WrapperMedia } from "@/components/wrappers/wrapper-media";
import { listWrapperFacets, listWrappers } from "@/features/wrappers/queries";

type SearchParams = { q?: string; platform?: string; format?: string };

function optionLabel(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function WrappersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = await searchParams;
  const [wrappers, facets] = await Promise.all([listWrappers(filters), listWrapperFacets()]);
  const backParams = new URLSearchParams();
  if (filters.q) backParams.set("q", filters.q);
  if (filters.platform) backParams.set("platform", filters.platform);
  if (filters.format) backParams.set("format", filters.format);
  const back = `/wrappers${backParams.size ? `?${backParams}` : ""}`;

  return <main className="wrapper-container">
    <header className="page-head wrapper-heading"><div><span className="eyebrow">Swipe file</span><h1>Wrapper library</h1><p className="muted">Scan proven structures, hooks, and adaptations from the vault.</p></div><span className="wrapper-count">{wrappers.length} {wrappers.length === 1 ? "item" : "items"}</span></header>
    <form className="wrapper-filters">
      <label className="sr-only" htmlFor="wrapper-search">Search wrappers</label>
      <input id="wrapper-search" name="q" defaultValue={filters.q} placeholder="Search hooks, creators, brands, or analysis" />
      <label className="sr-only" htmlFor="wrapper-platform">Platform</label>
      <select id="wrapper-platform" name="platform" defaultValue={filters.platform}><option value="">All platforms</option>{facets.platforms.map((platform) => <option key={platform} value={platform}>{optionLabel(platform)}</option>)}</select>
      <label className="sr-only" htmlFor="wrapper-format">Format</label>
      <select id="wrapper-format" name="format" defaultValue={filters.format}><option value="">All formats</option>{facets.formats.map((format) => <option key={format} value={format}>{optionLabel(format)}</option>)}</select>
      <button type="submit">Filter</button>
      {(filters.q || filters.platform || filters.format) && <Link className="button secondary" href="/wrappers">Clear</Link>}
    </form>
    {!wrappers.length ? <section className="panel wrapper-empty"><h2>No wrappers found</h2><p className="muted">Try a broader search or clear the selected filters.</p></section> : <section className="wrapper-board" aria-label="Wrapper gallery">
      {wrappers.map((wrapper) => {
        const href = `/wrappers/${encodeURIComponent(wrapper.slug)}?back=${encodeURIComponent(back)}`;
        const creator = wrapper.source_creator ?? wrapper.source_brand ?? wrapper.featured_person;
        const isVideo = wrapper.media_mime_type.startsWith("video/");
        return <article className="wrapper-card" key={wrapper.media_hash}>
          {isVideo ? <WrapperMedia slug={wrapper.slug} title={wrapper.title} mimeType={wrapper.media_mime_type} /> : <Link href={href} aria-label={`Open ${wrapper.title}`}><WrapperMedia slug={wrapper.slug} title={wrapper.title} mimeType={wrapper.media_mime_type} /></Link>}
          <Link className="wrapper-card-copy" href={href}>
            <div className="wrapper-meta"><span>{wrapper.platform}</span><span>{wrapper.format}</span></div>
            <h2>{wrapper.title}</h2>
            {creator && <p className="wrapper-byline">From {creator}</p>}
            <p className="wrapper-takeaway">{wrapper.takeaway}</p>
            <span className="wrapper-open">Open analysis <span aria-hidden="true">→</span></span>
          </Link>
        </article>;
      })}
    </section>}
  </main>;
}
