import { NextResponse } from 'next/server'
import { getMockNow } from '../_mock/now'

export const dynamic = 'force-static'

export async function GET() {
  return NextResponse.json(getMockNow())
}
