import { NextResponse } from 'next/server';

const YAHOO_API_KEY = process.env.YAHOO_FINANCE_API_KEY;
const YAHOO_API_HOST = 'yh-finance.p.rapidapi.com';

export async function POST(request: Request) {
  try {
    const { symbol } = await request.json();

    const response = await fetch(`https://${YAHOO_API_HOST}/stock/v2/get-summary?symbol=${symbol}`, {
      headers: {
        'X-RapidAPI-Key': YAHOO_API_KEY!,
        'X-RapidAPI-Host': YAHOO_API_HOST
      }
    });

    if (!response.ok) {
      console.error('Yahoo Finance Error:', {
        status: response.status,
        statusText: response.statusText
      });
      return NextResponse.json(
        { error: 'Failed to fetch from Yahoo Finance' }, 
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Yahoo Finance Request Failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Yahoo Finance' }, 
      { status: 500 }
    );
  }
} 