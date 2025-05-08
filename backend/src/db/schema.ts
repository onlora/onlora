import { relations } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { users } from './auth-schema'

// Re-export users so it can be imported from this module by other files
export { users }

// Enums
export const visibilityEnum = pgEnum('visibility_e', ['public', 'private'])
export const messageRoleEnum = pgEnum('message_role_e', ['user', 'ai'])
export const notificationTypeEnum = pgEnum('notification_type_e', [
  'like',
  'comment',
  'reply',
  'remix',
  'follow',
])

export const jams = pgTable('jams', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: text('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const messages = pgTable('messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  jamId: bigint('jam_id', { mode: 'number' }).references(() => jams.id, {
    onDelete: 'cascade',
  }),
  role: messageRoleEnum('role').notNull(),
  text: text('text'),
  images: jsonb('images'), // Assuming structure like [{id, url}]
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const images = pgTable('images', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  jamId: bigint('jam_id', { mode: 'number' }).references(() => jams.id, {
    onDelete: 'cascade',
  }),
  url: text('url').notNull(),
  r2Key: text('r2_key'), // Key for the object in R2 storage
  model: text('model'),
  prompt: text('prompt'), // The prompt used to generate the image
  // Optional: add width, height, format if needed from AI metadata
  // width: integer('width'),
  // height: integer('height'),
  isPublic: boolean('is_public').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const jamSessions = pgTable('jam_sessions', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  // title: text('title'), // Optional title for a jam session
  // settings: jsonb('settings'), // Could store things like model, aspect ratio etc.
})

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: text('author_id').references(() => users.id, {
    onDelete: 'set null',
  }), // Can be null if author deletes account
  title: text('title'),
  bodyMd: text('body_md'), // Markdown body
  tags: text('tags').array(), // Array of strings for tags
  visibility: visibilityEnum('visibility').default('public'),
  coverImg: text('cover_img_url'), // JS property is coverImg, SQL column is cover_img_url
  jamSessionId: integer('jam_session_id').references(() => jamSessions.id, {
    onDelete: 'set null',
  }), // Optional link to original jam session
  likeCount: integer('like_count').default(0).notNull(),
  commentCount: integer('comment_count').default(0).notNull(),
  remixCount: integer('remix_count').default(0).notNull(),
  viewCount: integer('view_count').default(0).notNull(),
  parentPostId: integer('parent_post_id').references(
    (): AnyPgColumn => posts.id,
    { onDelete: 'cascade' },
  ),
  rootPostId: integer('root_post_id').references((): AnyPgColumn => posts.id, {
    onDelete: 'cascade',
  }),
  generation: integer('generation').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  parentPost: one(posts, {
    fields: [posts.parentPostId],
    references: [posts.id],
    relationName: 'parentChild',
  }),
  childPosts: many(posts, {
    relationName: 'parentChild',
  }),
  likes: many(likes),
  comments: many(comments),
  postImages: many(postImages),
}))

export const likes = pgTable(
  'likes',
  {
    postId: bigint('post_id', { mode: 'number' })
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.postId, table.userId] }),
    }
  },
)

export const likesRelations = relations(likes, ({ one }) => ({
  post: one(posts, {
    fields: [likes.postId],
    references: [posts.id],
  }),
  user: one(users, {
    fields: [likes.userId],
    references: [users.id],
  }),
}))

export const comments = pgTable('comments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  postId: bigint('post_id', { mode: 'number' })
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  parentId: bigint('parent_id', { mode: 'number' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  parentComment: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: 'commentReplies',
  }),
  replies: many(comments, {
    relationName: 'commentReplies',
  }),
}))

export const veTxns = pgTable('ve_txns', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  delta: integer('delta'),
  reason: text('reason'),
  refId: bigint('ref_id', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const veTxnsRelations = relations(veTxns, ({ one }) => ({
  user: one(users, {
    fields: [veTxns.userId],
    references: [users.id],
  }),
}))

// Note: Indexes, Materialized Views (post_hot), and Triggers (after_remix)
// will be handled separately, typically during migration generation or with custom SQL scripts.

// Also define relations for other tables for comprehensive ORM features
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  likes: many(likes),
  comments: many(comments),
  jams: many(jams),
  veTxns: many(veTxns),
}))

export const jamsRelations = relations(jams, ({ one, many }) => ({
  user: one(users, {
    fields: [jams.userId],
    references: [users.id],
  }),
  messages: many(messages),
  images: many(images),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  jam: one(jams, {
    fields: [messages.jamId],
    references: [jams.id],
  }),
}))

export const imagesRelations = relations(images, ({ one, many }) => ({
  jam: one(jams, {
    fields: [images.jamId],
    references: [jams.id],
  }),
  postImages: many(postImages),
}))

// Note: Drizzle Kit should infer FK for posts.parentPostId from its name and type,
// or it can be explicitly created in a migration if needed.
// The relations definitions are primarily for Drizzle ORM query building.

export const follows = pgTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: text('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.followerId, table.followingId] }),
  }),
)

export const notifications = pgTable('notifications', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  recipientId: text('recipient_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').references(() => users.id, {
    onDelete: 'cascade',
  }), // User who triggered the notification (e.g., liker, commenter, follower)
  type: notificationTypeEnum('type').notNull(),
  postId: integer('post_id').references(() => posts.id, {
    onDelete: 'cascade',
  }), // Nullable, relevant for like, comment, reply, remix
  commentId: bigint('comment_id', { mode: 'number' }).references(
    () => comments.id,
    {
      onDelete: 'cascade',
    },
  ), // Nullable, relevant for reply
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
    relationName: 'userFollowers',
  }),
  followedUser: one(users, {
    fields: [follows.followingId],
    references: [users.id],
    relationName: 'userFollowing',
  }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, {
    fields: [notifications.recipientId],
    references: [users.id],
    relationName: 'notificationRecipient',
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: 'notificationActor',
  }),
  post: one(posts, {
    fields: [notifications.postId],
    references: [posts.id],
  }),
  comment: one(comments, {
    fields: [notifications.commentId],
    references: [comments.id],
  }),
}))

// Table to link Posts with their Images (Many-to-Many)
export const postImages = pgTable('post_images', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  postId: bigint('post_id', { mode: 'number' })
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  imageId: bigint('image_id', { mode: 'number' })
    .notNull()
    .references(() => images.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const postImagesRelations = relations(postImages, ({ one }) => ({
  post: one(posts, {
    fields: [postImages.postId],
    references: [posts.id],
  }),
  image: one(images, {
    fields: [postImages.imageId],
    references: [images.id],
  }),
}))

export const jamSessionsRelations = relations(jamSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [jamSessions.userId],
    references: [users.id],
  }),
  messages: many(messages),
}))
