import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { listJobs, type JobStatus } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr

  const encoder = new TextEncoder()
  const sentStatuses = new Map<string, JobStatus>()

  const stream = new ReadableStream({
    start(controller) {
      function send(data: string) {
        controller.enqueue(encoder.encode(data))
      }

      // Poll .jobs/ every 3 seconds
      const poller = setInterval(async () => {
        try {
          const jobs = await listJobs()
          for (const job of jobs) {
            const prev = sentStatuses.get(job.id)
            if (prev === undefined || prev !== job.status) {
              sentStatuses.set(job.id, job.status)
              send(`data: ${JSON.stringify(job)}\n\n`)
            }
          }
        } catch { /* keep polling */ }
      }, 3000)

      // Heartbeat every 15 seconds
      const heartbeat = setInterval(() => {
        send(': keepalive\n\n')
      }, 15_000)

      // Cleanup on client disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(poller)
        clearInterval(heartbeat)
        controller.close()
      })

      // Send initial snapshot immediately
      listJobs().then(jobs => {
        for (const job of jobs) {
          sentStatuses.set(job.id, job.status)
          send(`data: ${JSON.stringify(job)}\n\n`)
        }
      }).catch(() => {})
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
