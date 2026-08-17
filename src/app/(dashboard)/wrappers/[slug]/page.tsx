import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { WrapperMedia } from "@/components/wrappers/wrapper-media";
import { getWrapper } from "@/features/wrappers/queries";

function safeBack(value?: string) {
  return value?.startsWith("/wrappers") && !value.startsWith("//") ? value : "/wrappers";
}

export default async function WrapperDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ back?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const wrapper = await getWrapper(slug);
  if (!wrapper) notFound();
  const creator = wrapper.source_creator ?? wrapper.source_brand ?? wrapper.featured_person;
  return <main className="wrapper-detail-container">
    <Link className="wrapper-back" href={safeBack(query.back)}>← Back to wrappers</Link>
    <header className="wrapper-detail-head">
      <div className="wrapper-meta"><span>{wrapper.platform}</span><span>{wrapper.format}</span>{wrapper.created_on && <span>{new Date(`${wrapper.created_on}T00:00:00`).toLocaleDateString()}</span>}</div>
      <h1>{wrapper.title}</h1>
      {creator && <p className="muted">Source: {creator}</p>}
    </header>
    <section className="wrapper-detail-visual panel">
      <WrapperMedia slug={wrapper.slug} title={wrapper.title} mimeType={wrapper.media_mime_type} detail />
      <div className="wrapper-detail-actions"><a className="button secondary" href={`/api/wrappers/${encodeURIComponent(wrapper.slug)}/media`} target="_blank" rel="noreferrer">Open original media</a></div>
    </section>
    <article className="wrapper-analysis panel">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{wrapper.analysis_markdown}</ReactMarkdown>
      {wrapper.tags?.length > 0 && <footer className="wrapper-tags" aria-label="Tags">{wrapper.tags.map((tag: string) => <span className="badge" key={tag}>#{tag}</span>)}</footer>}
    </article>
  </main>;
}
