export type D1Result<T = Record<string, unknown>> = {
  results?: T[]
  success?: boolean
  meta?: Record<string, unknown>
}

export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>
}

export type D1Database = {
  prepare(query: string): D1PreparedStatement
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>>
}

export type SearchQueueMessage =
  | { kind: 'job', jobId: string }
  | { kind: 'reconcile' }

export type QueueSendBatchEntry<T> = {
  body: T
}

export type QueueBinding<T> = {
  send(message: T): Promise<void>
  sendBatch(messages: Array<QueueSendBatchEntry<T>>): Promise<void>
}

export type SearchWorkerEnv = {
  DB: D1Database
  SEARCH_INDEX_QUEUE: QueueBinding<SearchQueueMessage>
}

export type QueueMessage<T> = {
  body: T
  ack(): void
  retry(options?: { delaySeconds?: number }): void
}

export type MessageBatch<T> = {
  messages: Array<QueueMessage<T>>
}

export type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
}
