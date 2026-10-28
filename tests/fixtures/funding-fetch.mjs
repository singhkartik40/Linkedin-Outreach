// Loaded only by an isolated test server; no production configuration hook.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (new URL(url).hostname !== 'api.gdeltproject.org') return originalFetch(url, options);
  const articles = Array.from({ length: 5 }, (_, index) => ({
    title: `Browser Test Co ${index} raised $5 million in funding`,
    url: `https://example.com/funding/browser-test-${index}`,
    seendate: new Date().toISOString(),
  }));
  return new Response(JSON.stringify({ articles }), { headers: { 'Content-Type': 'application/json' } });
};
