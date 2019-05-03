import { makeExecutableSchema as makeGraphQLSchema } from 'graphql-tools';
import DataLoader from 'dataloader';
import { MongoClient } from 'mongodb';
import { ApolloServer } from 'apollo-server';
import ObjectHash from 'object-hash';

export default class MongoGraphql {
  constructor({ mongoHost, mongoDB, dbNameResolver = (name) => name, collectionNameResolver = (collection) => collection, schemaProps = {} }) {
    this.host = mongoHost;
    this.dbName = mongoDB;
    this.dbNameResolver = dbNameResolver;
    this.schemaProps = schemaProps;
    this.client = new MongoClient(this.host, { useNewUrlParser: true });
    this.collectionNameResolver = collectionNameResolver;
  }

  makeExecutableSchema = ({
                            ...props,
                            schemaDirectives = {},
                            directiveResolvers = {},
                            resolvers = {},
                            typeDefs = [],
                          }) => {
    let schemaParams = {
      ...props,
      schemaDirectives,
      directiveResolvers,
      resolvers,
      typeDefs,
    };
    let schema = makeGraphQLSchema(schemaParams);
    Object.entries(schema).forEach(this.handleSchemaType);

  };

  handleSchemaType = ([name, schemaType]) => {
    let props = this.getSchemaProps(schemaType);
    Object.entries(props).forEach(([key, value]) => {
    });
  };

  getSchemaProps = (object) => {
    return this.schemaProps[object.name] || {};
  };

  handleModel = (object) => {
    let collection = this.db.collection(object.collection);

    object.dataLoaders = {};
    object.dataLoader = (selector, pk) => {
      let key = ObjectHash({ pk, selector });
      if (!object.dataLoaders[key]) {
        object.dataLoaders[key] = new DataLoader(
          keys => {
            return collection.find({ [pk]: { $in: keys }, ...selector })
              .toArray()
              .then(data =>
                keys.map(
                  key =>
                    data.find(
                      item => item[pk].toString() === key.toString(),
                    ) || null,
                ),
              );
          },
          { cache: false },
        );
      }
      return object.dataLoaders[key];
    };
    object.find = async (selector = {}, context) => {
      if (object.permissions.c) {
        this.permissionManager(object, selector, context, object.permissions.c);
      }
      selector = { ...object.defaultQuery, ...selector };
      return await this.db.collection(object.collection).find(selector);

    };
    object.findOne = async ({ id, pk = object.pk, selector = {}, context }) => {
      return await object.dataLoader(object.defaultSelector(context, selector), pk).find(id);
    };
    object.insertOne = (doc) => {

    };
    object.insertMany = (docs) => {
    };
    object.updateOne = (selector, doc) => {
    };
    object.updateMany = (selector, doc) => {
    };
    object.deleteOne = (doc) => {
    };
    object.deleteMany = (selector) => {
    };


  };

  permissionManager = (object, selector, context, permission) => {
    return true;
  };

  handleContext = async () => (data) => {
  };

  connect = async () => {
    let connection = await this.client.connect();
    this.db = connection.db(this.dbName);
    const server = new ApolloServer({
      schema,
      introspection: true,
      playground: true,
      context: this.handleContext,
    });

    server.listen().then(({ url }) => {
      console.log(`🚀  Server ready at ${url}`);
    });
  };
};


`
type Document implements Document @model @permission(c:"", r:"", w:"", d:"") {
  something: Date @date(format:"MM/DD/YYYY", default:"now") @permission(w: "", d: "") @readOnly @default(value:"true")
  
}
`
;


const
  SchemaProps = {
    Document: {

      collection: null,
      abstract: true,
      inherit: false,
      inheritField: '_cls',
      pk: 'id',
      defaultQuery: (prev = {}) => (parent, context) => {
        return { active: true, removed: false, ...prev };
      },
      defaultValues: {
        active: true,
        removed: false,
        createdAt: () => new Date(),
        updatedAt: () => new Date(),
      },
      updateValues: {
        updatedAt: (parent, context) => new Date(),
      },
      permissions: {
        c: () => {
        },
        w: () => {
        },
        r: () => {
        },
        d: () => {
        },
      },
      resolver: () => {
      },


      findOne: (parent) => (args) => {

      },


    },

    OwnedDocument: {
      defaultQuery: (type, parent, context) => {
        let { defaultQuery = {} } = type;
        let { currentUser } = context;
        return defaultQuery;
      },
    },
  };
