"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard");

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.schemaDirectives = exports.typeDef = exports.setQueryExecutor = exports.INPUT_UPDATE_MANY_REQUIRED_RELATION_UPDATE = exports.INPUT_UPDATE_MANY_RELATION_UPDATE = exports.INPUT_UPDATE_MANY_REQUIRED_RELATION = exports.INPUT_UPDATE_ONE_REQUIRED_RELATION = exports.INPUT_UPDATE_MANY_RELATION = exports.INPUT_UPDATE_ONE_RELATION = exports.INPUT_CREATE_MANY_RELATION = exports.INPUT_CREATE_ONE_RELATION = void 0;

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

var _graphql = require("graphql");

var _graphqlTools = require("graphql-tools");

var _apolloServer = require("apollo-server");

var _ = _interopRequireWildcard(require("lodash"));

var _utils = require("../../utils");

var _queryExecutor = require("../../queryExecutor");

var _inputTypes = _interopRequireDefault(require("../../inputTypes"));

var _typeWrap = _interopRequireDefault(require("../../typeWrap"));

var _utils2 = require("../../inputTypes/utils");

var HANDLER = _interopRequireWildcard(require("../../inputTypes/handlers"));

var KIND = _interopRequireWildcard(require("../../inputTypes/kinds"));

var Transforms = _interopRequireWildcard(require("../../inputTypes/transforms"));

var _mongodb = require("mongodb");

const INPUT_CREATE_ONE_RELATION = 'createOneRelation';
exports.INPUT_CREATE_ONE_RELATION = INPUT_CREATE_ONE_RELATION;
const INPUT_CREATE_MANY_RELATION = 'createManyRelation';
exports.INPUT_CREATE_MANY_RELATION = INPUT_CREATE_MANY_RELATION;
const INPUT_UPDATE_ONE_RELATION = 'updateOneRelation';
exports.INPUT_UPDATE_ONE_RELATION = INPUT_UPDATE_ONE_RELATION;
const INPUT_UPDATE_MANY_RELATION = 'updateManyRelation';
exports.INPUT_UPDATE_MANY_RELATION = INPUT_UPDATE_MANY_RELATION;
const INPUT_UPDATE_ONE_REQUIRED_RELATION = 'updateOneRequiredRelation';
exports.INPUT_UPDATE_ONE_REQUIRED_RELATION = INPUT_UPDATE_ONE_REQUIRED_RELATION;
const INPUT_UPDATE_MANY_REQUIRED_RELATION = 'updateManyRequiredRelation';
exports.INPUT_UPDATE_MANY_REQUIRED_RELATION = INPUT_UPDATE_MANY_REQUIRED_RELATION;
const INPUT_UPDATE_MANY_RELATION_UPDATE = 'updateManyRelationUpdateMany';
exports.INPUT_UPDATE_MANY_RELATION_UPDATE = INPUT_UPDATE_MANY_RELATION_UPDATE;
const INPUT_UPDATE_MANY_REQUIRED_RELATION_UPDATE = 'updateManyRequiredRelationUpdateMany';
exports.INPUT_UPDATE_MANY_REQUIRED_RELATION_UPDATE = INPUT_UPDATE_MANY_REQUIRED_RELATION_UPDATE;
let queryExecutor = null;

const setQueryExecutor = q => queryExecutor = q;

exports.setQueryExecutor = setQueryExecutor;
const typeDef = `directive @relation(field:String="_id", storeField:String=null ) on FIELD_DEFINITION`;
exports.typeDef = typeDef;

const dbRef = dbRef => dbRef.toJSON();

class RelationDirective extends _graphqlTools.SchemaDirectiveVisitor {
  constructor(..._args) {
    super(..._args);
    (0, _defineProperty2.default)(this, "_transformToInputWhere", ({
      field
    }) => {
      const {
        field: relationField
      } = this.args;
      let {
        mmFieldTypeWrap: fieldTypeWrap,
        mmCollectionName: collection,
        mmStoreField: storeField
      } = this;

      let inputType = _inputTypes.default.get(fieldTypeWrap.realType(), KIND.WHERE);

      let modifiers = fieldTypeWrap.isMany() ? ['some', 'none'] : [''];
      let fields = [];
      modifiers.forEach(modifier => {
        let fieldName = field.name;

        if (modifier !== '') {
          fieldName = `${field.name}_${modifier}`;
        }

        fields.push({
          name: fieldName,
          type: inputType,
          mmTransform: async (params, context) => {
            params = params[fieldName];
            let value = await queryExecutor({
              type: _queryExecutor.DISTINCT,
              collection,
              context,
              selector: await (0, _utils2.applyInputTransform)(context)(params, inputType),
              options: {
                key: relationField
              }
            }); // if (!isMany) {

            value = {
              $in: value
            }; // }

            return {
              [storeField]: value
            };
          }
        });
      });
      return fields;
    });
    (0, _defineProperty2.default)(this, "_validateInput", (type, isMany) => params => {
      let input = _.head(Object.values(params));

      if (Object.keys(input).length === 0) {
        throw new _apolloServer.UserInputError(`You should fill any field in ${type.name} type`);
      }

      if (!isMany && Object.keys(input).length > 1) {
        throw new _apolloServer.UserInputError(`You should not fill multiple fields in ${type.name} type`);
      }

      return params;
    });
    (0, _defineProperty2.default)(this, "_groupBy", (input, field) => input.reduce((colls, c) => {
      let parameter = c[field];

      let value = _.omit(c, field);

      return colls[parameter] ? { ...colls,
        [parameter]: [...colls[parameter], value]
      } : { ...colls,
        [parameter]: [value]
      };
    }, {}));
    (0, _defineProperty2.default)(this, "_groupByCollection", input => this._groupBy(input, 'mmCollectionName'));
    (0, _defineProperty2.default)(this, "_transformToInputCreateUpdate", ({
      field,
      kind,
      inputTypes
    }) => {
      let fieldTypeWrap = new _typeWrap.default(field.type);
      let isCreate = kind === KIND.CREATE;
      let type = inputTypes.get(fieldTypeWrap.realType(), fieldTypeWrap.isMany() ? isCreate ? INPUT_CREATE_MANY_RELATION : fieldTypeWrap.isRequired() ? INPUT_UPDATE_MANY_REQUIRED_RELATION : INPUT_UPDATE_MANY_RELATION : isCreate ? INPUT_CREATE_ONE_RELATION : fieldTypeWrap.isRequired() ? INPUT_UPDATE_ONE_REQUIRED_RELATION : INPUT_UPDATE_ONE_RELATION);
      return [{
        name: field.name,
        type,
        mmTransform: (0, _utils2.reduceTransforms)([this._validateInput(type, fieldTypeWrap.isMany()), Transforms.applyNestedTransform(type), fieldTypeWrap.isMany() ? this._transformInputMany(isCreate) : this._transformInputOne(isCreate)])
      }];
    });
    (0, _defineProperty2.default)(this, "_transformInputOne", isCreate => async (params, resolverArgs) => {
      let {
        parent,
        context
      } = resolverArgs;
      let {
        mmStoreField: storeField,
        mmRelationField: relationField
      } = this;

      let input = _.head(Object.values(params));

      let collection = this.mmCollectionName;

      if (input.connect) {
        ////Connect
        let selector = input.connect;

        if (this.isAbstract) {
          collection = selector.mmCollectionName;
          delete selector.mmCollectionName;
        }

        let ids = await this._distinctQuery({
          collection,
          selector,
          context
        });

        if (ids.length === 0) {
          throw new _apolloServer.UserInputError(`No records found for selector - ${JSON.stringify(selector)}`);
        }

        let id = this.isAbstract ? new _mongodb.DBRef(collection, _.head(ids)) : _.head(ids);
        return {
          [storeField]: id
        };
      } else if (input.create) {
        ////Create
        let doc = input.create;

        if (this.isAbstract) {
          let {
            mmCollectionName: collection,
            ...doc
          } = doc;
        }

        let id = await this._insertOneQuery({
          doc,
          collection,
          context
        });
        id = this.isAbstract ? new _mongodb.DBRef(collection, id) : id;
        return {
          [storeField]: id
        };
      } else if (input.disconnect) {
        ////Disconnect
        return {
          [storeField]: {
            $mmUnset: 1
          }
        };
      } else if (input.delete) {
        collection = this.isAbstract ? input.delete.mmCollectionName : collection;
        return {
          [storeField]: {
            $mmDeleteSingleRelation: {
              collection,
              relationField
            }
          }
        };
      }
    });
    (0, _defineProperty2.default)(this, "_transformInputMany", isCreate => async (params, resolverArgs) => {
      let {
        mmStoreField: storeField,
        mmCollectionName: collection
      } = this;
      let {
        parent,
        context
      } = resolverArgs;

      let input = _.head(Object.values(params));

      let disconnect_ids = [];
      let delete_ids = [];
      let connect_ids = [];
      let create_ids = [];
      let response = {
        [storeField]: {}
      };

      if (input.connect) {
        ////Connect
        if (this.isAbstract) {
          connect_ids = Promise.all(_.toPairs(this._groupByCollection(input.connect)).map(([collection, connects]) => this._distinctQuery({
            selector: {
              $or: connects
            },
            collection,
            context
          }).then(ids => ids.map(id => new _mongodb.DBRef(collection, id))))).then(res => _.flatten(res));
        } else {
          let selector = {
            $or: input.connect
          };
          connect_ids = this._distinctQuery({
            selector,
            context
          });
        } // if (ids.length === 0) {
        //   throw new UserInputError(
        //     `No records found for selector - ${JSON.stringify(selector)}`
        //   );
        // }

      }

      if (input.create) {
        ////Create
        let docs = input.create;

        if (this.isAbstract) {
          create_ids = Promise.all(_.toPairs(this._groupByCollection(input.create)).map(([collection, creates]) => ////if creates.length>0
          this._insertManyQuery({
            docs: creates,
            context,
            collection
          }).then(ids => ids.map(id => new _mongodb.DBRef(collection, id))))).then(res => _.flatten(res)); // } else {
          //   _ids = await this._insertOneQuery({
          //     doc: creates[0],
          //     context,
          //     collection: coll,
          //   }).then(id => [new DBRef(coll, id)]);
          // }
        } else {
          create_ids = this._insertManyQuery({
            docs,
            context
          });
        }
      }

      connect_ids = await connect_ids;
      create_ids = await create_ids;
      let ids = parent[storeField] || [];

      if (isCreate) {
        ids = [...connect_ids, ...create_ids];
      } else {
        ids = [...ids, ...connect_ids, ...create_ids];

        if (input.disconnect) {
          if (this.isAbstract) {
            disconnect_ids = Promise.all(_.toPairs(this._groupByCollection(input.disconnect)).map(([collection, disconnects]) => this._distinctQuery({
              selector: {
                $or: disconnects
              },
              collection,
              context
            }).then(res => res.map(id => new _mongodb.DBRef(collection, id))))).then(res => _.flatten(res));
          } else {
            ////Disconnect
            let selector = {
              $or: input.disconnect
            };
            disconnect_ids = this._distinctQuery({
              selector,
              context
            });
          } // if (disconnect_ids.length === 0) {
          //   throw new UserInputError(`No records found for where clause`);
          // }

        }

        if (input.delete) {
          if (this.isAbstract) {
            delete_ids = Promise.all(_.flatten(_.toPairs(this._groupByCollection(input.delete)).map(([collection, deletes]) => deletes.map(selector => this._deleteOneQuery({
              collection,
              selector,
              context
            }).then(id => new _mongodb.DBRef(collection, id))))));
          } else {
            delete_ids = input.delete.map(async selector => this._deleteOneQuery({
              selector,
              context
            }));
          }
        }

        disconnect_ids = await Promise.all(disconnect_ids);
        delete_ids = await Promise.all(delete_ids);
        delete_ids = delete_ids.filter(id => id);
        ids = ids.filter(r => {
          let found = [...disconnect_ids, ...delete_ids].find(d => {
            let did = d;
            let rid = r;

            if (d instanceof _mongodb.DBRef) {
              let {
                $id: dID
              } = dbRef(d);
              did = dID;
            }

            if (r instanceof _mongodb.DBRef) {
              let {
                $id: rID
              } = dbRef(r);
              rid = rID;
            }

            return rid.toString() === did.toString();
          });
          return !found;
        });
      }

      return {
        [storeField]: ids
      };
    });
    (0, _defineProperty2.default)(this, "_onSchemaBuild", ({
      field
    }) => {
      let fieldTypeWrap = new _typeWrap.default(field.type);
      this.mmCollectionName = fieldTypeWrap.realType().mmCollectionName;
      this.mmInterfaceModifier = {};
      this.isAbstract = fieldTypeWrap.isAbstract(); //Collection name and interface modifier

      if (fieldTypeWrap.interfaceWithDirective('model')) {
        let {
          mmDiscriminator
        } = fieldTypeWrap.realType();
        let {
          mmDiscriminatorField
        } = fieldTypeWrap.interfaceWithDirective('model');
        this.mmInterfaceModifier = {
          [mmDiscriminatorField]: mmDiscriminator
        };
      }
    });
    (0, _defineProperty2.default)(this, "_onSchemaInit", ({
      field
    }) => {
      let fieldTypeWrap = new _typeWrap.default(field.type); ///Args and connection field

      if (fieldTypeWrap.isMany()) {
        let whereType = _inputTypes.default.get(fieldTypeWrap.realType(), fieldTypeWrap.isInterface() ? KIND.WHERE_INTERFACE : KIND.WHERE);

        let orderByType = _inputTypes.default.get(fieldTypeWrap.realType(), KIND.ORDER_BY);

        field.args = (0, _utils.allQueryArgs)({
          whereType,
          orderByType
        });

        if (!fieldTypeWrap.isAbstract()) {
          this._addConnectionField(field);
        }
      }
    });
    (0, _defineProperty2.default)(this, "_resolveSingle", field => async (parent, args, context, info) => {
      const {
        field: relationField
      } = this.args;
      let {
        mmFieldTypeWrap: fieldTypeWrap,
        mmCollectionName: collection,
        mmStoreField: storeField,
        mmInterfaceModifier
      } = this;
      let selector = { ...mmInterfaceModifier
      };
      let value = parent[storeField];

      if (fieldTypeWrap.isAbstract()) {
        let {
          $id: id,
          $ref: c
        } = dbRef(value);
        collection = c;
        value = id;
      }

      if (!value) return null;
      return queryExecutor({
        type: _queryExecutor.FIND_IDS,
        collection,
        selector,
        options: {
          selectorField: relationField,
          ids: [value]
        },
        context
      }).then(res => {
        let data = _.head(res);

        if (data) {
          data['mmCollection'] = collection;
        }

        return data;
      });
    });
    (0, _defineProperty2.default)(this, "_resolveMany", field => async (parent, args, context, info) => {
      const {
        field: relationField
      } = this.args;
      let {
        mmFieldTypeWrap: fieldTypeWrap,
        mmCollectionName: collection,
        mmObjectType: modelType,
        mmStoreField: storeField,
        mmInterfaceModifier
      } = this;

      let whereType = _inputTypes.default.get(fieldTypeWrap.realType(), fieldTypeWrap.isInterface() ? KIND.WHERE_INTERFACE : KIND.WHERE);

      let value = parent[storeField];
      if (!value) return fieldTypeWrap.isRequired() ? [] : null;
      let selector = {};

      if (!fieldTypeWrap.isAbstract()) {
        selector = await (0, _utils2.applyInputTransform)({
          parent,
          context
        })(args.where, whereType);
      }

      if (fieldTypeWrap.isInterface()) {
        selector = Transforms.validateAndTransformInterfaceInput(whereType)({
          selector
        }).selector;
      }

      selector = { ...selector,
        ...mmInterfaceModifier
      };

      if (args.skip) {
        value = _.drop(value, args.skip);
      }

      if (args.first) {
        value = _.take(value, args.first);
      }

      if (this.isAbstract) {
        let collections = this._groupBy(value.map(v => v.toJSON()), '$ref');

        return Promise.all(_.toPairs(collections).map(([collection, ids]) => this._findIDsQuery({
          collection,
          selector,
          options: {
            selectorField: relationField,
            ids: ids.map(id => id.$id)
          },
          context
        }).then(results => results.map(r => ({ ...r,
          mmCollectionName: collection
        }))))).then(res => _.flatten(res));
      } else {
        return this._findIDsQuery({
          collection,
          selector,
          options: {
            selectorField: relationField,
            ids: value
          },
          context
        });
      }
    });
    (0, _defineProperty2.default)(this, "_addConnectionField", field => {
      const {
        field: relationField
      } = this.args;
      let {
        mmFieldTypeWrap: fieldTypeWrap,
        mmCollectionName: collection,
        mmStoreField: storeField
      } = this;
      const {
        _typeMap: SchemaTypes
      } = this.schema;

      let whereType = _inputTypes.default.get(fieldTypeWrap.realType(), 'where');

      let orderByType = _inputTypes.default.get(fieldTypeWrap.realType(), 'orderBy');

      let connectionName = `${field.name}Connection`;
      this.mmObjectType._fields[connectionName] = {
        name: connectionName,
        isDeprecated: false,
        args: (0, _utils.allQueryArgs)({
          whereType,
          orderByType
        }),
        type: SchemaTypes[`${fieldTypeWrap.realType().name}Connection`],
        resolve: async (parent, args, context, info) => {
          let value = parent[storeField];

          if (Array.isArray(value)) {
            value = {
              $in: value
            };
          }

          let selector = {
            $and: [await (0, _utils2.applyInputTransform)({
              parent,
              context
            })(args.where, whereType), {
              [relationField]: value
            }]
          };
          return {
            _selector: selector,
            _skip: args.skip,
            _limit: args.first
          };
        },
        [HANDLER.TRANSFORM_TO_INPUT]: {
          [KIND.CREATE]: () => [],
          [KIND.WHERE]: () => [],
          [KIND.UPDATE]: () => [],
          [KIND.ORDER_BY]: () => []
        }
      };
    });
    (0, _defineProperty2.default)(this, "_distinctQuery", async ({
      collection,
      selector,
      context
    }) => {
      const {
        field: relationField
      } = this.args;
      let {
        mmCollectionName,
        mmStoreField: storeField,
        mmInterfaceModifier
      } = this;
      selector = { ...selector,
        ...mmInterfaceModifier
      };
      collection = collection || mmCollectionName;
      return queryExecutor({
        type: _queryExecutor.DISTINCT,
        collection,
        selector,
        context,
        options: {
          key: relationField
        }
      });
    });
    (0, _defineProperty2.default)(this, "_findIDsQuery", async ({
      collection,
      selector,
      options,
      context
    }) => {
      return queryExecutor({
        type: _queryExecutor.FIND_IDS,
        collection,
        selector,
        options,
        context
      });
    });
    (0, _defineProperty2.default)(this, "_deleteOneQuery", async ({
      collection,
      selector,
      context
    }) => {
      const {
        field: relationField
      } = this.args;
      let {
        mmCollectionName,
        mmStoreField: storeField,
        mmInterfaceModifier
      } = this;
      collection = collection || mmCollectionName;
      selector = { ...selector,
        ...mmInterfaceModifier
      };
      return queryExecutor({
        type: _queryExecutor.DELETE_ONE,
        collection,
        selector,
        context
      }).then(res => res ? res[relationField] : null);
    });
    (0, _defineProperty2.default)(this, "_insertOneQuery", async ({
      collection,
      doc,
      context
    }) => {
      const {
        field: relationField
      } = this.args;
      let {
        mmCollectionName,
        mmStoreField: storeField,
        mmInterfaceModifier
      } = this;
      doc = { ...doc,
        ...mmInterfaceModifier
      };
      collection = collection || mmCollectionName;
      return queryExecutor({
        type: _queryExecutor.INSERT_ONE,
        collection,
        doc,
        context
      }).then(res => res[relationField]);
    });
    (0, _defineProperty2.default)(this, "_insertManyQuery", async ({
      collection,
      docs,
      context
    }) => {
      const {
        field: relationField
      } = this.args;
      let {
        mmCollectionName,
        mmStoreField: storeField,
        mmInterfaceModifier
      } = this;
      docs = docs.map(doc => ({ ...doc,
        ...mmInterfaceModifier
      }));
      collection = collection || mmCollectionName;
      return queryExecutor({
        type: _queryExecutor.INSERT_MANY,
        collection,
        docs,
        context
      }).then(res => res.map(item => item[relationField]));
    });
  }

  visitFieldDefinition(field, {
    objectType
  }) {
    const {
      field: relationField,
      storeField
    } = this.args;
    let fieldTypeWrap = new _typeWrap.default(field.type); // let isAbstract = fieldTypeWrap.realType().mmAbstract;
    // issue if interface defined after relation

    let isAbstract = (0, _utils.getDirective)(fieldTypeWrap.realType(), 'abstract');

    if (!((0, _utils.getDirective)(fieldTypeWrap.realType(), 'model') || fieldTypeWrap.interfaceWithDirective('model') || isAbstract)) {
      throw `Relation field type should be defined with Model directive or Abstract interface. (Field '${field.name}' of type '${fieldTypeWrap.realType().name}')`;
    }

    this.mmObjectType = objectType;
    this.mmFieldTypeWrap = fieldTypeWrap;
    this.mmRelationField = relationField;
    this.mmStoreField = storeField || (0, _utils.getRelationFieldName)(fieldTypeWrap.realType().name, relationField, fieldTypeWrap.isMany());
    (0, _utils2.appendTransform)(field, HANDLER.TRANSFORM_TO_INPUT, {
      [KIND.ORDER_BY]: field => [],
      [KIND.CREATE]: this._transformToInputCreateUpdate,
      [KIND.UPDATE]: this._transformToInputCreateUpdate,
      [KIND.WHERE]: this._transformToInputWhere
    });
    field.mmOnSchemaInit = this._onSchemaInit;
    field.mmOnSchemaBuild = this._onSchemaBuild;
    field.resolve = fieldTypeWrap.isMany() ? this._resolveMany(field) : this._resolveSingle(field);
  }

}

let createInputTransform = (type, isInterface) => (0, _utils2.reduceTransforms)([Transforms.applyNestedTransform(type), isInterface ? Transforms.validateAndTransformInterfaceInput(type) : null]);

const createInput = ({
  name,
  initialType,
  kind,
  inputTypes
}) => {
  let fields = {};
  let typeWrap = new _typeWrap.default(initialType);
  let createType = inputTypes.get(initialType, typeWrap.isInterface() ? KIND.CREATE_INTERFACE : KIND.CREATE);
  let whereType = inputTypes.get(initialType, typeWrap.isInterface() ? KIND.WHERE_INTERFACE : KIND.WHERE);
  let updateType = inputTypes.get(initialType, typeWrap.isInterface() ? KIND.UPDATE_INTERFACE : KIND.UPDATE);
  let whereUniqueType = inputTypes.get(initialType, typeWrap.isInterface() ? KIND.WHERE_UNIQUE_INTERFACE : KIND.WHERE_UNIQUE);

  if ([INPUT_CREATE_MANY_RELATION, INPUT_UPDATE_MANY_RELATION, INPUT_UPDATE_MANY_REQUIRED_RELATION].includes(kind)) {
    createType = new _graphql.GraphQLList(createType);
    whereType = new _graphql.GraphQLList(whereType);
    whereUniqueType = new _graphql.GraphQLList(whereUniqueType);
  }

  fields.create = {
    name: 'create',
    type: createType,
    mmTransform: createInputTransform(createType, typeWrap.isInterface())
  };
  fields.connect = {
    name: 'connect',
    type: whereUniqueType,
    mmTransform: createInputTransform(whereUniqueType, typeWrap.isInterface())
  };

  if ([INPUT_UPDATE_MANY_RELATION, INPUT_UPDATE_MANY_REQUIRED_RELATION].includes(kind)) {
    let updateKind = INPUT_UPDATE_MANY_RELATION ? INPUT_UPDATE_MANY_RELATION_UPDATE : INPUT_UPDATE_MANY_REQUIRED_RELATION_UPDATE;
    let updateManyType = inputTypes.get(initialType, updateKind);
    fields.updateMany = {
      name: 'updateMany',
      type: updateManyType,
      mmTransform: createInputTransform(updateManyType, typeWrap.isInterface())
    };
  } else if ([INPUT_UPDATE_ONE_RELATION, INPUT_UPDATE_ONE_REQUIRED_RELATION].includes(kind)) {
    fields.update = {
      name: 'update',
      type: updateType,
      mmTransform: createInputTransform(updateType, typeWrap.isInterface())
    };
  }

  if ([INPUT_UPDATE_MANY_RELATION, INPUT_UPDATE_MANY_REQUIRED_RELATION].includes(kind)) {
    fields.disconnect = {
      name: 'disconnect',
      type: whereUniqueType,
      mmTransform: createInputTransform(whereUniqueType, typeWrap.isInterface())
    };
    fields.delete = {
      name: 'delete',
      type: whereUniqueType,
      mmTransform: createInputTransform(whereUniqueType, typeWrap.isInterface())
    };
  }

  if ([INPUT_UPDATE_ONE_RELATION].includes(kind)) {
    fields.disconnect = {
      name: 'disconnect',
      type: _graphql.GraphQLBoolean,
      mmTransform: () => {
        throw new Error('Disconnect is not supported for single relation yet');
      }
    };
    fields.delete = {
      name: 'delete',
      type: _graphql.GraphQLBoolean,
      mmTransform: () => {
        throw new Error('Delete is not supported for single relation yet');
      }
    };
  }

  let newType = new _graphql.GraphQLInputObjectType({
    name,
    fields
  });
  newType.getFields();
  return newType;
};

const createUpdateManyInput = ({
  name,
  initialType,
  kind,
  inputTypes
}) => {
  let fields = {};
  let typeWrap = new _typeWrap.default(initialType);
  let updateType = inputTypes.get(initialType, typeWrap.isInterface() ? KIND.UPDATE_INTERFACE : KIND.UPDATE);
  let whereUniqueType = inputTypes.get(initialType, typeWrap.isInterface() ? KIND.WHERE_UNIQUE_INTERFACE : KIND.WHERE_UNIQUE);
  fields.where = {
    name: 'where',
    type: whereUniqueType,
    mmTransform: createInputTransform(whereUniqueType, typeWrap.isInterface())
  };
  fields.data = {
    name: 'data',
    type: updateType,
    mmTransform: createInputTransform(updateType, typeWrap.isInterface())
  };
  let newType = new _graphql.GraphQLInputObjectType({
    name,
    fields
  });
  newType.getFields();
  return newType;
};

_inputTypes.default.registerKind(INPUT_CREATE_ONE_RELATION, createInput);

_inputTypes.default.registerKind(INPUT_CREATE_MANY_RELATION, createInput);

_inputTypes.default.registerKind(INPUT_UPDATE_ONE_RELATION, createInput);

_inputTypes.default.registerKind(INPUT_UPDATE_MANY_RELATION, createInput);

_inputTypes.default.registerKind(INPUT_UPDATE_ONE_REQUIRED_RELATION, createInput);

_inputTypes.default.registerKind(INPUT_UPDATE_MANY_REQUIRED_RELATION, createInput);

_inputTypes.default.registerKind(INPUT_UPDATE_MANY_RELATION_UPDATE, createUpdateManyInput);

_inputTypes.default.registerKind(INPUT_UPDATE_MANY_REQUIRED_RELATION_UPDATE, createUpdateManyInput);

const schemaDirectives = {
  relation: RelationDirective
};
exports.schemaDirectives = schemaDirectives;