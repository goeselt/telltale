import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { loadConfig } from './config.ts'
import { LiveClient } from './github/live.ts'
import { FixtureClient } from './github/fixture.ts'
import { collectAll } from './collectors/index.ts'
import { renderReport } from './report.ts'

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  const fixturesDir = flag(args, '--fixtures')
  const out = flag(args, '--out') ?? process.env['TELLTALE_OUTPUT'] ?? 'overview.html'
  const configDir = flag(args, '--config-dir') ?? process.env['TELLTALE_CONFIG_DIR'] ?? 'config/'
  const reposFile = flag(args, '--repos')

  const token = process.env['GITHUB_TOKEN']

  const client = fixturesDir
    ? new FixtureClient(resolve(fixturesDir))
    : (() => {
        if (!token) {
          process.stderr.write('telltale: GITHUB_TOKEN is required for live runs (or use --fixtures <dir>)\n')
          process.exit(1)
        }
        return new LiveClient(token)
      })()

  process.stderr.write(`telltale: loading config from ${configDir}\n`)
  const config = await loadConfig(resolve(configDir), reposFile ? resolve(reposFile) : undefined)

  process.stderr.write(`telltale: collecting repositories from ${config.groups.length} group(s)\n`)
  const snapshots = await collectAll(client, config.groups, config.profiles)

  if (snapshots.length === 0) {
    process.stderr.write('telltale: no repositories collected\n')
    process.exit(1)
  }

  const report = renderReport(snapshots, new Date().toISOString())

  if (out === '-') {
    process.stdout.write(report)
  } else {
    const outPath = resolve(out)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, report, 'utf-8')
    process.stderr.write(`telltale: wrote ${outPath}\n`)
  }
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const val = args[i + 1]
  if (!val || val.startsWith('--')) {
    process.stderr.write(`telltale: ${name} requires a value\n`)
    process.exit(1)
  }
  return val
}

main().catch((err) => {
  process.stderr.write(`telltale: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
