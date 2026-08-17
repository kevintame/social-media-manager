type WrapperMediaProps = {
  slug: string;
  title: string;
  mimeType: string;
  detail?: boolean;
};

export function WrapperMedia({ slug, title, mimeType, detail = false }: WrapperMediaProps) {
  const src = `/api/wrappers/${encodeURIComponent(slug)}/media`;
  if (mimeType.startsWith("video/")) {
    return <video className={detail ? "wrapper-detail-media" : "wrapper-card-media"} controls muted playsInline preload="metadata" aria-label={`Video for ${title}`}>
      <source src={src} type={mimeType} />
      Your browser cannot play this video.
    </video>;
  }
  // Vault media is authenticated and has varying intrinsic dimensions, so the native element preserves its exact aspect ratio.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={detail ? "wrapper-detail-media" : "wrapper-card-media"} src={src} alt={`Screenshot: ${title}`} loading={detail ? "eager" : "lazy"} decoding="async" />;
}
