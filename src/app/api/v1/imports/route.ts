import { tenantRoute, searchParams } from '../../../../server/http/handler.ts'
import { parseOrThrow, z } from '../../../../server/http/validate.ts'
import { badRequest } from '../../../../server/http/errors.ts'
import { commitImport, stageImport } from '../../../../server/services/imports.ts'

const Query = z
  .object({
    kind: z.enum(['customers', 'assets']),
    /*
     * Default false: staging parses and validates the whole file and writes
     * nothing. Committing is a second, deliberate request — writing as we
     * parse leaves a partly applied import when row eighty is wrong.
     */
    commit: z.coerce.boolean().optional(),
    /** Only with an explicit commit, having seen the problems from staging. */
    partial: z.coerce.boolean().optional(),
  })
  .strict()

/** The file itself, as text. */
async function bodyText(request: Request): Promise<string> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.includes('text/csv') && !type.includes('text/plain')) {
    throw badRequest('Send the file as text/csv.')
  }
  const text = await request.text()
  if (!text.trim()) throw badRequest('That file is empty.')
  // 8 MB of CSV is roughly 100,000 rows; past that it belongs in a job.
  if (text.length > 8 * 1024 * 1024) throw badRequest('That file is too large to import in one request.')
  return text
}

/**
 * Stages or commits a bulk import.
 *
 * Staging reports every problem at once with its line number, because somebody
 * fixing a hundred-row file should learn about all of it in one pass. A commit
 * with any invalid row is refused whole unless `partial` is set, and each row
 * is written through the ordinary service — so an import cannot bypass a rule
 * a form obeys.
 */
export const POST = tenantRoute(async ({ request, ctx }) => {
  const query = parseOrThrow(Query, searchParams(request))
  const text = await bodyText(request)

  if (!query.commit) return { body: stageImport(query.kind, text) }
  return { body: await commitImport(ctx, query.kind, text, { partial: query.partial }) }
})
