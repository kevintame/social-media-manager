grant usage on schema public to authenticated;
grant select on public.profiles, public.documents, public.posts, public.post_media,
  public.post_comments, public.post_activity, public.sync_state, public.publications to authenticated;
grant insert, update on public.post_comments to authenticated;
grant insert on public.post_activity to authenticated;
grant usage, select on all sequences in schema public to authenticated;
