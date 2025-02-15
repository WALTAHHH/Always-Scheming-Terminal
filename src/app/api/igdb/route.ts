import { NextResponse } from 'next/server';

const TWITCH_CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

async function getAccessToken(): Promise<string> {
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials'
    })
  });

  const data = await response.json();
  return data.access_token;
}

export async function POST(request: Request) {
  try {
    const { endpoint, query } = await request.json();
    const token = await getAccessToken();
    
    console.log('IGDB Request:', {
      endpoint,
      query,
      clientId: TWITCH_CLIENT_ID?.substring(0, 5) + '...',
      tokenPrefix: token?.substring(0, 5) + '...'
    });
    
    const igdbResponse = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': TWITCH_CLIENT_ID!,
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'text/plain'
      },
      body: query
    });

    if (!igdbResponse.ok) {
      const errorText = await igdbResponse.text();
      console.error('IGDB Error:', {
        status: igdbResponse.status,
        statusText: igdbResponse.statusText,
        error: errorText
      });
      return NextResponse.json({ error: errorText }, { status: igdbResponse.status });
    }

    const data = await igdbResponse.json();
    console.log('IGDB Success Response:', {
      resultCount: Array.isArray(data) ? data.length : 'not an array',
      firstResult: data[0] ? { id: data[0].id, name: data[0].name } : null
    });
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('IGDB Request Failed:', error);
    return NextResponse.json({ error: 'Failed to fetch from IGDB' }, { status: 500 });
  }
} 