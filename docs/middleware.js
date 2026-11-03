// Widgets request the committed status.json path (bypass query included).
// Rewrite that one path to the function that may serve a newer encrypted envelope.
// Avatars and the rest of the static site are left alone.
export const config = {
  matcher: '/c85352c42452f0db1e1c5e56f60e5128/status.json',
};

export default function middleware(request) {
  const url = new URL(request.url);
  url.pathname = '/api/status-envelope';
  return new Response(null, {
    headers: { 'x-middleware-rewrite': url.toString() },
  });
}
