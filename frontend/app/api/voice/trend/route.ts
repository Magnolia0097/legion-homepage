import { NextResponse } from 'next/server'
import { getMockTrend } from '../_mock/trend'

export const dynamic = 'force-static'

export async function GET() {
  return NextResponse.json(getMockTrend(7))
}
