export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const acao = url.searchParams.get('acao') || 'panorama';
    const de   = url.searchParams.get('de')   || '';
    const ate  = url.searchParams.get('ate')  || '';

    let target = `https://script.google.com/macros/s/AKfycbyx3BlhOM2eIR2swdb_Y9lacBWyTOmFBG636qKRv902sUSTqJYztMSJvRAKEwcfFA5e/exec?acao=${acao}&_t=${Date.now()}`;
    if (de)  target += `&de=${encodeURIComponent(de)}`;
    if (ate) target += `&ate=${encodeURIComponent(ate)}`;

    try {
      const resp = await fetch(target, { redirect: 'follow' });
      const body = await resp.text();

      return new Response(body, {
        status: resp.ok ? 200 : resp.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ erro: err.message }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
