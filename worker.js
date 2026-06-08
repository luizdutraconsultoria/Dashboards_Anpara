export default {
  async fetch(request) {
    const url = new URL(request.url);
    const acao = url.searchParams.get('acao') || 'panorama';
    const target = `https://script.google.com/macros/s/AKfycbyx3BlhOM2eIR2swdb_Y9lacBWyTOmFBG636qKRv902sUSTqJYztMSJvRAKEwcfFA5e/exec?acao=${acao}`;

    const resp = await fetch(target, { redirect: 'follow', cache: 'no-store' });
    const body = await resp.text();

    return new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  },
};
