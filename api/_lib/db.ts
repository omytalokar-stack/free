import './env'
import mongoose from 'mongoose'

type MongooseCache = {
  connection: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

const globalWithMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache
}

const cache = globalWithMongoose.mongooseCache ??= {
  connection: null,
  promise: null,
}

export async function connectToDatabase() {
  if (cache.connection) return cache.connection

  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MongoDB is not configured. Set MONGODB_URI in the server environment.')
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error('MONGODB_URI must be a valid MongoDB connection URI.')
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 10,
    }).catch(error => {
      cache.promise = null
      throw error
    })
  }

  cache.connection = await cache.promise
  return cache.connection
}
