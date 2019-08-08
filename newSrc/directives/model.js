import { SchemaDirectiveVisitor } from 'graphql-tools';
import DataLoader from 'dataloader';

import SDLSyntaxException from '../../src/sdlSyntaxException';
import { getDirective, lowercaseFirstLetter } from '../../src/utils';
import ObjectHash from 'object-hash';
import { ObjectID } from 'mongodb';
import { mongoGraphqlConfig } from '../MongoGraphql';
import Types from '../inputTypes';
import * as KINDS from '../inputTypes/kinds';


const dataLoaderMatch = (key) => item => {
  if (item instanceof ObjectID) {
    return key.toString() === item.toString();
  }
  return key === item;
};

const getDefaults = (defaults, ...args) => {
  return Object.entries(defaults).reduce((obj = {}, [key, value]) => {
    if (typeof value === 'function') {
      value = value(...args);
    }
    obj[key] = value;
    return obj;
  });
};

const setupDefault = (schemaType) => {
  let overrides = this.server.schemaProps(schemaType);
  if (schemaType.from) {
    schemaType._fields = { ...schemaType.from._fields, ...schemaType._fields };
  }
  schemaType.selector = (selector = {}, context) => {
    if (schemaType.from) {
      selector = schemaType.from.selector(selector, context);
    }
    if (schemaType.inheritKey) {
      selector = { ...selector, [schemaType.inheritField]: schemaType.inheritKey };
    }

    if (overrides && overrides.selector) {
      selector = overrides.selector(selector, context);
    }
    return selector;
  };


  let defaults = Object.entries({ ...schemaType._fields, '___': overrides }).reduce((defaults = {
    createDefaults: {},
    updateDefaults: {},
  }, [name, field]) => {
    let { createDefaults = {}, updateDefaults = {} } = field;
    defaults['createDefaults'] = { ...defaults['createDefaults'], ...createDefaults };
    defaults['updateDefaults'] = { ...defaults['updateDefaults'], ...updateDefaults };
    return defaults;
  });
  schemaType = { ...schemaType, ...defaults };
};

mongoGraphqlConfig.buildDirective(
  'model',
  `directive @model(collection:String=null, implements:GraphQLInterfaceType=null) on OBJECT | INTERFACE
   
   type Account implements Document @model {
    purchases: [Purchases]
   }
   
   type Order @query([
   {query: {account: 'owner', paid:true}, queryName: "myLast10Purchases"}
   ])
   
  `,
  {
    visitObject(object) {
      let { collection } = this.args;
      object.isModel = true;
      object.collection = collection || this.server.collectionNameResolver(object.name);
      let setup = setupDefault.bind(this);
      setup(object);
      this.setupODM(object);

    },

    visitInterface(iface) {
      const { _typeMap: SchemaTypes } = this.schema;
      let { collection, implements: i } = this.args;
      let setup = setupDefault.bind(this);
      if (i) {
        iface.from = i;
        iface.inherit = true;
        if (iface.from.inherit) {
          iface.inheritKey = `${iface.from.inheritKey || iface.from.name}.${iface.name}`;
          iface.inheritField = iface.from.inheritField;
        } else {
          iface.inheritKey = iface.name;
          iface.inheritField = '_cls'; //TODO: Make this configurable
          iface.collection = collection || this.server.collectionNameResolver(iface.name);

        }
        setup(iface);
        this.setupODM(iface);
      }
    },

    setupODM(schemaType) {
      let db = this.server.db.collection(schemaType.collection);
      let { ...cursor } = db;
      schemaType.cursor = cursor;
      schemaType.cursor.findDataLoader = (key, value, selector, options) => {
        let hashKey = ObjectHash({ key, selector, options });
        if (!schemaType.dataLoaders[hashKey]) {
          schemaType.dataLoaders[hashKey] = new DataLoader(
            keys => {
              return db.find({ [key]: { $in: keys }, ...selector }, options)
                .toArray()
                .then(data =>
                  keys.map(
                    key =>
                      data.find(dataLoaderMatch(key)) || null,
                  ),
                );
            },
            { cache: false },
          );
        }
        return schemaType.dataLoaders[hashKey];
      };

      schemaType.preSave = (doc, creating = false, context) => doc;
      schemaType.postSave = (result, context) => false;


      schemaType.findOne = async (key, value, context, info) => {
        let selector = { ...schemaType.selector(context, info) };
        return await schemaType.cursor.findDataLoader(key, value, selector, {});
      };
      schemaType.findById = async (id, context) => {
        return await schemaType.findOne(schemaType.pk, id, context);
      };

      schemaType.findUnique = async (field, value, context, info) => {
        return await schemaType.findOne(field, value, context, info);
      };
      schemaType.find = async (selector, options, context) => {
        selector = { ...selector, ...schemaType.selector(context) };
        return await schemaType.cursor.find(selector, options);
      };

      schemaType.insertOne = async (doc, context) => {
        let defaults = getDefaults(schemaType.createDefaults, doc, context);
        doc = { ...defaults, ...doc };
        doc = schemaType.preSave(doc, true, context);
        let result = await schemaType.cursor.insertOne(doc);
        let postSave = schemaType.postSave(result, context);
        if (postSave) {
          result = await schemaType.cursor.updateOne({ [schemaType.pk]: result[schemaType.pk] }, postSave);
        }
        return result;
      };

      schemaType.insertMany = async (docs, options, context) => {
        docs = docs.map(doc => {
          let defaults = getDefaults(schemaType.createDefaults, doc, context);
          doc = { ...defaults, ...doc };
          return schemaType.preSave(doc, true, context);
        });
        let results = await schemaType.cursor.insertMany(docs, options);
        results = results.map(async result => {
          let postSave = schemaType.postSave(result, context);
          if (postSave) {
            result = await schemaType.cursor.updateOne({ [schemaType.pk]: result[schemaType.pk] }, postSave);
          }
          return result;
        });

        return results;
      };

      schemaType.updateOne = (id, doc, context) => {
      };

      schemaType.updateMany = (ids, doc, context) => {
      };

      schemaType.deleteOne = (id, context) => {
      };

      schemaType.deleteMany = (ids, context) => {
      };
    },
  });

mongoGraphqlConfig.buildDirective(
  'abstract',
  `directive @abstract(implements:GraphQLInterfaceType) on INTERFACE`,
  {
    visitInterface(iface) {
      let { implements: i } = this.args;
      let setup = setupDefault.bind(this);
      iface.from = i;
      setup(iface);
    },
  },
);
