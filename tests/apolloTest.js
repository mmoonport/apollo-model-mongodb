import { ApolloServer } from 'apollo-server';
import AMM, { QueryExecutor } from '../src/';
import { MongoClient, ObjectID } from 'mongodb';
import typeDefs from '../dev-server/model.js';
import MongoMemoryServer from 'mongodb-memory-server';

export const mongod = new MongoMemoryServer();
const uri = mongod.getConnectionString();
const dbName = mongod.getDbName();

let DB = null;

export const connectToDatabase = () => {
  if (DB && DB.serverConfig.isConnected()) {
    return Promise.resolve(DB);
  }
  return Promise.all([uri, dbName]).then(([uri, dbName]) =>
    MongoClient.connect(uri, { useNewUrlParser: true }).then(client => {
      DB = client.db(dbName);
      return DB;
    })
  );
};

const schema = new AMM({
  queryExecutor: QueryExecutor(connectToDatabase),
}).makeExecutableSchema({
  resolverValidationOptions: {
    requireResolversForResolveType: false,
  },
  typeDefs,
});

export const server = new ApolloServer({
  schema,
  introspection: true,
  playground: true,
  formatError: error => {
    console.log(error);
    console.dir(error.extensions);
    return error;
  },
});

const { createTestClient } = require('apollo-server-testing');
export const { query, mutate } = createTestClient(server);
