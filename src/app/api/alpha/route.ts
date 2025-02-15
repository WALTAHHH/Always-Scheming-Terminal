import { NextResponse } from 'next/server';

const ALPHA_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    console.log('Alpha Vantage API Request:', { 
      symbol,
      hasApiKey: !!ALPHA_API_KEY,
      apiKeyLength: ALPHA_API_KEY?.length
    });
    
    if (!symbol) {
      console.error('Missing symbol parameter');
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    if (!ALPHA_API_KEY) {
      console.error('Alpha Vantage API Key is missing');
      return NextResponse.json(
        { error: 'API configuration error - Missing API Key' },
        { status: 500 }
      );
    }

    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_API_KEY}`;
    console.log('Making request to Alpha Vantage:', url.replace(ALPHA_API_KEY, 'REDACTED'));
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store'
      });

      const data = await response.json();
      console.log('Alpha Vantage Response:', {
        status: response.status,
        hasData: !!data,
        fields: Object.keys(data),
        responseData: data
      });

      if (!response.ok) {
        console.error('Alpha Vantage Error:', data);
        return NextResponse.json(
          { error: `Failed to fetch from Alpha Vantage: ${JSON.stringify(data)}` }, 
          { status: response.status }
        );
      }

      if (Object.keys(data).length === 0) {
        return NextResponse.json(
          { error: 'No data returned from Alpha Vantage' },
          { status: 404 }
        );
      }

      return NextResponse.json(data);
    } catch (fetchError: any) {
      console.error('Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch from Alpha Vantage API', details: fetchError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Alpha Vantage Request Failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Alpha Vantage', details: error.message },
      { status: 500 }
    );
  }
} 