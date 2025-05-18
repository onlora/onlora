import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { posts, users } from './schema'

// Table to store Lens account information
export const lensAccounts = pgTable('lens_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  address: text('address').notNull().unique(), // Wallet address is the primary identifier in new Lens
  username: text('username').unique(), // Just the username, no namespace
  metadata: text('metadata'), // Store additional metadata as JSON string
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
})

// Establish relations with the users table
export const lensAccountsRelations = relations(lensAccounts, ({ one }) => ({
  user: one(users, {
    fields: [lensAccounts.userId],
    references: [users.id],
  }),
}))

// Table to store Lens post information
export const lensPosts = pgTable('lens_posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => lensAccounts.id, { onDelete: 'cascade' }),
  lensPostId: text('lens_post_id').unique(), // The ID of the post on Lens
  metadataUri: text('metadata_uri'), // Content metadata URI (IPFS, Arweave, etc.)
  transactionHash: text('transaction_hash'), // For on-chain transactions
  lensPublishedAt: timestamp('lens_published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
})

// Establish relations with posts and lens_accounts tables
export const lensPostsRelations = relations(lensPosts, ({ one }) => ({
  post: one(posts, {
    fields: [lensPosts.postId],
    references: [posts.id],
  }),
  account: one(lensAccounts, {
    fields: [lensPosts.accountId],
    references: [lensAccounts.id],
  }),
}))
