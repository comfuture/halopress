import { getDb } from '../server/db/db'
import { syncContentItems } from '../server/cms/content-items'

const schemaKey = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : undefined
const onlyMissing = !process.argv.includes('--force')

const db = await getDb()
const result = await syncContentItems({ db, schemaKey, onlyMissing })

const scopeLabel = schemaKey ? `schema ${schemaKey}` : 'all schemas'
const modeLabel = onlyMissing ? 'only missing' : 'full sync'
console.log(`[content_items backfill] ${scopeLabel} (${modeLabel})`)
console.log(result)
