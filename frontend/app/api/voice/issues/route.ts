import { NextResponse } from 'next/server'
import { getMockIssues } from '../_mock/issues'

export const dynamic = 'force-static'

export async function GET() {
  return NextResponse.json(getMockIssues(5))
}
