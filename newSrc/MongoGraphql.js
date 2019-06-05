import { makeExecutableSchema as makeGraphQLSchema, SchemaDirectiveVisitor } from 'graphql-tools';
import DataLoader from 'dataloader';
import { MongoClient } from 'mongodb';
import { ApolloServer } from 'apollo-server';
import ObjectHash from 'object-hash';
import { GraphQLBoolean, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLScalarType } from 'graphql';
import { allQueryArgs } from '../src/utils';
import Types from './inputTypes';
import * as KINDS from './inputTypes/kinds';
import inflection from 'inflection';

const { camelize, pluralize } = inflection;

class MongoGraphqlConfig {
  static _instance;

  constructor() {
    this.schemaProps = {
      schemaDirectives: {},
      directiveResolvers: {},
      resolvers: {},
      typeDefs: [],
    };
  }

  static instance() {
    if (!MongoGraphqlConfig._instance) {
      MongoGraphqlConfig._instance = new MongoGraphqlConfig();
    }
    return MongoGraphqlConfig._instance;
  }

  buildDirective = (directiveName, typeDef, visitors = {}, resolver) => (server) => {
    let visitor = class extends SchemaDirectiveVisitor {
      constructor(props) {
        super(props);
        this.server = server;
        Object.entries(visitors).forEach(([key, method]) => {
          this[key] = method.bind(this);
        });
      }

    };
    this.schemaProps.typeDefs.push(typeDef);
    this.schemaProps.schemaDirectives[directiveName] = visitor;
    if (resolver) {
      this.schemaProps.directiveResolvers[directiveName] = resolver;
    }
  };
  addScalar = ({ name, description, serialize, parseValue, parseLiteral }) => {
    this.schemaProps.resolvers[name] = new GraphQLScalarType({
      name,
      description,
      serialize,
      parseLiteral,
      parseValue,
    });
  };

  addTypeDef = (typeDef) => this.schemaProps.typeDefs.push(typeDef);
  addResolver = (typeName, fieldName, method) => {
    let resolvers = this.schemaProps.resolvers[typeName] || {};
    let resolver = resolvers[fieldName];
    if (resolver) {
      resolver = (parent, args, context, info) => resolver(method(parent, args, context, info), args, context, info);
    }
  };
}

export const mongoGraphqlConfig = MongoGraphqlConfig.instance();

export default class MongoGraphql {
  constructor({ mongoHost, mongoDB, fieldNameResolver = (name) => name, collectionNameResolver = (collection) => collection, schemaProps = {} }) {
    this.host = mongoHost;
    this.dbName = mongoDB;
    this.fieldNameResolver = fieldNameResolver;
    this.schemaProps = schemaProps;
    this.client = new MongoClient(this.host, { useNewUrlParser: true });
    this.collectionNameResolver = collectionNameResolver;
    this.schema = null;
  }

  makeExecutableSchema = ({
                            ...props,
                            schemaDirectives = {},
                            directiveResolvers = {},
                            resolvers = {},
                            typeDefs = [],
                          }) => {
    let { schemaProps } = mongoGraphqlConfig;
    schemaProps = { ...schemaProps, ...props };
    schemaProps.schemaDirectives = {
      ...Object.entries(schemaProps.schemaDirectives).reduce((directives = {}, [k, method]) => {
        directives[k] = method(this);
        return { ...directives, [k]: method(this) };
      }), ...schemaDirectives,
    };
    schemaProps.directiveResolvers = { ...schemaProps.directiveResolvers, ...directiveResolvers };
    schemaProps.resolvers = { ...schemaProps.resolvers, ...resolvers };
    schemaProps.typeDefs = [...schemaProps.typeDefs, ...typeDefs];
    this.schema = makeGraphQLSchema(schemaProps);
    let { _typeMap: SchemaTypes } = this.schema;
    let { Query, Mutation } = SchemaTypes;
    Object.entries(this.schema).forEach(this.handleSchemaType(Query, Mutation));

  };

  handleSchemaType = (Query, Mutation) => ([schemaTypeName, schemaType]) => {

    let addQuery = (field) => Query._fields[field.name] = field;
    let addMutation = (field) => Mutation._fields[field.name] = field;

    let { isModel, inherit, permissions } = schemaType;
    if (isModel) {
      this.buildCreateMutation(schemaType, addMutation);
      this.buildCreateManyMutation(schemaType, addMutation);
      this.buildUpdateMutation(schemaType, addMutation);
      this.buildUpdateManyMutation(schemaType, addMutation);
      this.buildDeleteMutation(schemaType, addMutation);
      this.buildDeleteManyMutation(schemaType, addMutation);
    }
    if (isModel || inherit) {
      this.buildFindByIdQuery(schemaType, addQuery);
      this.buildFindQuery(schemaType, addQuery);
      this.buildPagedFindQuery(schemaType, addQuery);
    }
  };

  handleContext = async () => (data) => {
    return {
      tokenInfo: {},
      account: null,
      device: null,
    };
  };

  buildCreateMutation = (schemaType, Mutation) => {
    let createType = Types.inputFor(KINDS.CREATE, schemaType);
    Mutation({
      name: `create${schemaType.name}`,
      description: `Creates a single ${schemaType.name}`,
      type: schemaType,
      args: [
        { type: new GraphQLNonNull(createType), name: 'data' },
      ],
      isDeprecated: false,
      resolve: async (parent, { data }, context, info) => {
        return createType.process(data, context, info);
      },
    });
  };
  buildCreateManyMutation = (schemaType, Mutation) => {
    let createType = Types.inputFor(KINDS.CREATE, schemaType);
    Mutation({
      name: `createMany${pluralize(schemaType.name)}`,
      description: `Creates multiple ${pluralize(schemaType.name)}`,
      type: new GraphQLList(schemaType),
      args: [
        { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(createType))), name: 'data' },
      ],
      isDeprecated: false,
      resolve: async (parent, { data }, context, info) => {
        return await schemaType.insertMany(data.map((d) => {
          createType.process(d);
        }), context);
      },
    });
  };
  buildUpdateMutation = (schemaType, Mutation) => {
    let whereUniqueType = Types.inputFor(KINDS.WHERE_UNIQUE, schemaType);
    let updateType = Types.inputFor(KINDS.UPDATE, schemaType);
    Mutation({
      name: `update${schemaType.name}`,
      description: `Updates a single  ${schemaType.name}`,
      type: schemaType,
      args: [
        { type: new GraphQLNonNull(whereUniqueType), name: 'where' },
        { type: new GraphQLNonNull(updateType), name: 'data' },
      ],
      isDeprecated: false,
      resolve: async (parent, { where, data }, context, info) => {
        return await schemaType.updateOne(whereUniqueType.process(where), updateType.process(data), context);
      },
    });
  };
  buildUpdateManyMutation = (schemaType, Mutation) => {
    let updateWhereType = Types.inputFor(KINDS.UPDATE_WHERE, schemaType);
    Mutation({
      name: `updateMany${pluralize(schemaType.name)}`,
      description: `Updates multiple ${pluralize(schemaType.name)}`,
      type: new GraphQLList(schemaType),
      args: [
        { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(updateWhereType))), name: 'data' },
      ],
      isDeprecated: false,
      resolve: async (parent, { data }, context, info) => {
        return await Promise.all(data.map((d) => {
          let { where, data } = updateWhereType.process(d);
          return schemaType.updateOne(where, data, context);
        }));
      },
    });
  };
  buildDeleteMutation = (schemaType, Mutation) => {
    Mutation({
      name: `delete${schemaType.name}`,
      type: GraphQLBoolean,
      description: `Deletes a single ${schemaType.name}`,
      args: [
        { type: schemaType.pkFieldType, name: schemaType.pkFieldName },
      ],
      isDeprecated: false,
      resolve: async (parent, { [schemaType.pkFieldName]: pk }, context, info) => {
        return await schemaType.deleteOne(pk, context, info);
      },
    });
  };
  buildDeleteManyMutation = (schemaType, Mutation) => {
    Mutation({
      name: `deleteMany${pluralize(schemaType.name)}`,
      type: GraphQLBoolean,
      description: `Deletes multiple ${pluralize(schemaType.name)}`,
      args: [
        { type: new GraphQLList(schemaType.pkFieldType), name: pluralize(schemaType.pkFieldName) },
      ],
      isDeprecated: false,
      resolve: async (parent, { [pluralize(schemaType.pkFieldName)]: pks }, context, info) => {
        return await schemaType.deleteMany(pks, context, info);
      },
    });
  };
  buildFindByIdQuery = (schemaType, Query) => {
    Query({
      name: camelize(schemaType.name),
      type: GraphQLBoolean,
      description: `finds a single ${schemaType.name}`,
      args: [
        { type: schemaType.pkFieldType, name: schemaType.pkFieldName },
      ],
      isDeprecated: false,
      resolve: async (parent, { [schemaType.pkFieldName]: pk }, context, info) => {
        return await schemaType.findById(pk, context, info);
      },
    });
  };
  buildFindQuery = (schemaType, Query) => {
    let whereType = Types.inputFor(KINDS.WHERE, schemaType);
    let orderByType = Types.inputFor(KINDS.ORDER_BY, schemaType);
    Query({
      name: camelize(pluralize(schemaType.name)),
      type: GraphQLBoolean,
      description: `finds ${pluralize(schemaType.name)}`,
      args: [
        { type: whereType, name: 'where' },
        { type: orderByType, name: 'sort' },
        { type: GraphQLInt, name: 'skip' },
        { type: GraphQLInt, name: 'limit' },
      ],
      isDeprecated: false,
      resolve: async (parent, { where, sort, skip, limit }, context, info) => {
        sort = orderByType.process(sort);
        where = await whereType.process(where);
        return await schemaType.find(where, {
          sort, skip, limit,
        }, context, info);
      },
    });
  };
  buildPagedFindQuery = (schemaType, Query) => {
    let whereType = Types.inputFor(KINDS.WHERE, schemaType);
    let orderByType = Types.inputFor(KINDS.ORDER_BY, schemaType);
    let pagedType = Types.inputFor(KINDS.PAGED, schemaType);
    Query({
      name: `${camelize(pluralize(schemaType.name))}Paged`,
      type: pagedType,
      description: `finds ${pluralize(schemaType.name)} with pagination`,
      args: [
        { type: whereType, name: 'where' },
        { type: orderByType, name: 'sort' },
        { type: GraphQLInt, name: 'skip' },
        { type: GraphQLInt, name: 'limit' },
      ],
      isDeprecated: false,
      resolve: async (parent, { where, sort, skip, limit }, context, info) => {
        where = await whereType.process(where);
        sort = orderByType.process(sort);
        return await schemaType.find(where, {
          sort, skip, limit,
        }, context, info);
      },
    });
  };

  connect = async () => {
    let connection = await this.client.connect();
    this.db = connection.db(this.dbName);
    const server = new ApolloServer({
      schema: this.schema,
      introspection: true,
      playground: true,
      context: this.handleContext,
    });

    server.listen().then(({ url }) => {
      console.log(`🚀  Server ready at ${url}`);
    });
  };
};
