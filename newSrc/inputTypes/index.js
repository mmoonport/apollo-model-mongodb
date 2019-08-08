import _ from 'lodash';
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';
import { applyInputTransform } from './utils';
import { getDirective } from '../utils';
import TypeWrap from '../typeWrap';
import * as KIND from './kinds';
import { asyncForEach, asyncMapValues } from '../../src/utils';
import inflection from 'inflection';

const { camelize, pluralize } = inflection;

export const UNMARKED_OBJECT_FIELD = 'unmarkedObjectField';

const ObjectHash = require('object-hash');

const ModifierTypes = {
  in: type => new GraphQLList(type),
  not_in: type => new GraphQLList(type),
  not: null,
  exists: GraphQLBoolean,
  lt: null,
};

const
  buildModField = ({ process, many = false, type: overrideType }) => (name, type) => {
    type = overrideType || type;
    if (many && !overrideType) {
      type = new GraphQLList(type);
    }
    return { name, type, process };
  };

const r = (value, options) => {
  return { $regex: new RegExp(value, options) };
};

const buildRegexModField = ({ regex }) => (name, type) => {
  let process = (value) => ({ $regex: regex });
  return { name, type, process };
};

export const Mods = {
  '': buildModField({ process: (value) => value }),
  'not': buildModField({ process: (value) => ({ $not: { $eq: value } }) }),
  'exists': buildModField({ type: GraphQLBoolean, process: (value) => ({ $exists: value }) }),
  'in': buildModField({ many: true, process: (value) => ({ $in: value }) }),
  'not_in': buildModField({ many: true, process: (value) => ({ $not: { $in: value } }) }),
  'lt': buildModField({ process: (value) => ({ $lt: value }) }),
  'lte': buildModField({ process: (value) => ({ $lte: value }) }),
  'gt': buildModField({ process: (value) => ({ $gt: value }) }),
  'gte': buildModField({ process: (value) => ({ $gte: value }) }),
  'all': buildModField({ many: true, process: (value) => ({ $all: value }) }),
  'not_all': buildModField({ many: true, process: (value) => ({ $not: { $all: value } }) }),
  'size': buildModField({ many: true, type: GraphQLInt, process: (value) => ({ $size: value }) }),
  'not_size': buildModField({ many: true, type: GraphQLInt, process: (value) => ({ $not: { $size: value } }) }),
  'size_gt': buildModField({ many: true, type: GraphQLInt, process: (value) => ({ $size: { $gt: value } }) }),
  'size_gte': buildModField({ many: true, type: GraphQLInt, process: (value) => ({ $size: { $gte: value } }) }),
  'size_lt': buildModField({ many: true, type: GraphQLInt, process: (value) => ({ $size: { $lt: value } }) }),
  'size_lte': buildModField({ many: true, type: GraphQLInt, process: (value) => ({ $size: { $lte: value } }) }),
  'empty': buildModField({
    many: true,
    type: GraphQLBoolean,
    process: (value) => value ? { $size: 0 } : { $not: { $size: 0 } },
  }),
  'contains': buildModField({ type: GraphQLString, process: (value) => r(value) }),
  'icontains': buildModField({ type: GraphQLString, process: (value) => r(value, 'i') }),
  'not_contains': buildModField({
    type: GraphQLString,
    process: (value) => ({ $not: r(value) }),
  }),
  'not_icontains': buildModField({
    type: GraphQLString,
    process: (value) => ({ $not: r(value, 'i') }),
  }),
  'starts_with': buildModField({ type: GraphQLString, process: (value) => r(`^${value}`) }),
  'istarts_with': buildModField({ type: GraphQLString, process: (value) => r(`^${value}`, 'i') }),
  'not_starts_with': buildModField({
    type: GraphQLString,
    process: (value) => ({
      $not: r(`^${value}`),
    }),
  }),
  'not_istarts_with': buildModField({
    type: GraphQLString,
    process: (value) => ({
      $not: r(`^${value}`, 'i'),
    }),
  }),
  'ends_with': buildModField({ type: GraphQLString, process: (value) => r(`${value}$`) }),
  'iends_with': buildModField({ type: GraphQLString, process: (value) => r(`${value}$`, 'i') }),
  'not_ends_with': buildModField({ type: GraphQLString, process: (value) => ({ $not: r(`${value}$`) }) }),
  'not_iends_with': buildModField({ type: GraphQLString, process: (value) => ({ $not: r(`${value}$`, 'i') }) }),

};

export const Modifiers = {
  Boolean: ['', 'not', 'exists'],
  ID: ['', 'in', 'not_in', 'exists'],
  ObjectID: ['', 'in', 'not', 'not_in', 'exists'],
  Int: ['', 'in', 'not', 'not_in', 'lt', 'lte', 'gt', 'gte', 'exists'],
  Float: ['', 'in', 'not', 'not_in', 'lt', 'lte', 'gt', 'gte', 'exists'],
  Date: ['', 'not', 'lt', 'lte', 'gt', 'gte', 'exists'],
  Relationship: ['exists', 'not'],
  ManyRelationship: ['exists', 'in', 'not_in', 'empty', 'all', 'not_all', 'size', 'not_size', 'size_gt', 'size_gte', 'size_lt', 'size_lte'],
  String: [
    '',
    'in',
    'not_in',
    'lt',
    'lte',
    'gt',
    'gte',
    'contains',
    'icontains',
    'not_contains',
    'not_icontains',
    'starts_with',
    'istarts_with',
    'not_starts_with',
    'not_istarts_with',
    'ends_with',
    'iends_with',
    'not_ends_with',
    'not_iends_with',
    'exists',
  ],
};

const modifierFieldsForType = (field, type) => {
  let modifiers = Modifiers[type] || [];
  return modifiers.reduce((resp = {}, modifier) => {
    let name = this._fieldNameWithModifier(field.name, modifier);
    resp[name] = Mods[modifier](name, type);
    return resp;
  });
};


export class EmptyTypeException extends Error {
  constructor(type) {
    super();
    this._type = type;
  }

  toString = () => `Type ${this._type.name} must define one or more fields`;
}

const addInterfaceValues = (val, initialType, fieldType) => {
  if (initialType.mmAbstract)
    return {
      mmCollectionName: fieldType.mmCollectionName,
    };
  if (initialType.mmDiscriminatorField) {
    return { [initialType.mmDiscriminatorField]: fieldType.mmDiscriminator };
  }
  return {};
};

const addUpdateInterfaceValues = (val, initialType, fieldType) => {
  if (initialType.mmAbstract)
    return {
      mmCollectionName: fieldType.mmCollectionName,
    };
  if (initialType.mmDiscriminatorField) {
    return {
      [initialType.mmDiscriminatorField]: {
        $mmEquals: fieldType.mmDiscriminator,
      },
    };
  }
  return {};
};

class TypesClass {
  Kinds = [];

  constructor(SchemaTypes) {
    this.SchemaTypes = SchemaTypes;

    this.registerKind(KIND.CREATE, this._createInputObject, this._fillCreateInputObject);
    this.registerKind(KIND.UPDATE, this._createInputObject, this._fillUpdateInputObject);
    this.registerKind(KIND.UPDATE_WHERE, this._createInputObject, this._fillUpdateWhereInputObject);
    this.registerKind(KIND.WHERE, this._createInputObject, this._fillWhereInputObject);
    this.registerKind(KIND.WHERE_UNIQUE, this._createInputObject, this._fillWhereUniqueInputObject);
    this.registerKind(KIND.ORDER_BY, this._createInputEnum, this._fillOrderByInputObject);
    this.registerKind(KIND.PAGED, this._createObjectType, this._fillPagedObjectType);
    this.registerKind([KIND.CREATE_RELATION], this._createInputObject, this._fillRelationCreateInputObject);
    this.registerKind([KIND.CREATE_EMBEDDED], this._createInputObject, this._fillEmbeddedCreateInputObject);
    this.registerKind([KIND.UPDATE_RELATION], this._createInputObject, this._fillRelationUpdateInputObject);
    this.registerKind([KIND.UPDATE_EMBEDDED], this._createInputObject, this._fillEmbeddedUpdateInputObject);
  }


  _defaultTransformToInputOrderBy = ({ field }) => [
    {
      name: `${field.name}_ASC`,
      value: { [field.name]: 1 },
    },
    {
      name: `${field.name}_DESC`,
      value: { [field.name]: -1 },
    },
  ];

  _fieldNameWithModifier = (name, modifier) => {
    if (modifier !== '') {
      return `${name}_${modifier}`;
    } else {
      return name;
    }
  };

  _type = typeName => {
    if (!this.SchemaTypes[typeName]) throw `Type ${typeName} not found`;
    return this.SchemaTypes[typeName];
  };

  _createInputEnum = ({ name, initialType, kind }) => {
    let values = [];
    let type = new GraphQLEnumType({
      name,
      values,
    });
    type.getValues();
    return type;
  };

  _createInputObject = ({ name, initialType, subType, kind }) => {
    let newType = new GraphQLInputObjectType({
      name,
      fields: {},
    });
    newType.initialType = initialType;
    newType.subType = subType;
    newType.kind = kind;
    newType.getFields();
    return newType;
  };

  _addAndOr = (fields, type) => {
    let manyType = new GraphQLList(type);
    fields.AND = {
      name: 'AND',
      type: manyType,
      mmTransform: async (params, context) => {
        params = await applyInputTransform(context)(params.AND, manyType);
        return { $and: params };
      },
    };
    fields.OR = {
      name: 'OR',
      type: manyType,
      mmTransform: async (params, context) => {
        params = await applyInputTransform(context)(params.OR, manyType);
        return { $or: params };
      },
    };
  };

  _fillOrderByInputObject = ({ type, initialType }) => {
    let values = type._values;
    Object.values(initialType._fields).forEach(field => {
      values = [...values, {
        name: `${field.name}_ASC`,
        value: { [field.dbName]: 1 },
      }, {
        name: `${field.name}_DESC`,
        value: { [field.dbName]: -1 },
      }];
    });
    type._values = values;
  };

  _fillCreateInputObject = ({ type, initialType }) => {
    /*
      Turns initialType (some model in the
     */
    let fields = {};
    Object.values(initialType._fields).filter(field => {
      return !field.readOnly; //Also need to exclude the primary key field if schema auto generates it
    }).forEach(field => {
      fields[field.name] = field.createField || {
        name: field.name,
        type: field.type,
        process: (data, context, info) => {
          return data;
        },
      };
    });
    type._fields = fields;
    type.process = async (data, context, info) => {
      let doc = await asyncMapValues(data, async (value, key) => {
        let field = type._fields[key];
        return await field.process(value, context, info);
      });
      let options = {};
      return await initialType.insertOne(doc, options);
    };
  };

  _fillUpdateInputObject = ({ type, initialType }) => {
    let fields = {};
    Object.values(initialType._fields).filter(field => {
      return !field.readOnly; //Also need to exclude the primary key field if schema auto generates it
    }).forEach(field => {
      fields[field.name] = field.updateField || {
        name: field.name,
        type: field.type,
        process: (value) => value !== null ? { $set: { [field.name]: value } } : { $unset: { [field.name]: 1 } },
      };
    });
    type._fields = fields;
    type.process = async (data) => {
      let values = [];
      await asyncForEach(Object.keys(data), async (key) => {
        let field = type._fields[key];
        let value = data[key];
        values.push(await field.process(value));
      });
      return deepmerge(...values);
    };
  };

  _fillUpdateWhereInputObject = ({ type, initialType }) => {
    let whereType = Types.inputFor(KIND.WHERE_UNIQUE, initialType);
    let dataType = Types.inputFor(KIND.UPDATE, initialType);
    type._fields = {
      where: {
        name: 'where',
        type: whereType,
      },
      data: {
        name: 'data',
        type: dataType,
      },
    };
    type.process = async ({ where, data }) => {
      where = await whereType.process(where);
      data = await dataType.process(data);
      return { where, data };
    };
  };

  _fillWhereInputObject = ({ type, initialType, kind }) => {
    let fields = {};
    Object.values(initialType._fields).forEach(field => {
      if (field.whereFields) {
        fields = { ...fields, ...field.whereFields };
      } else {
        let wrap = new TypeWrap(field.type);
        let realType = wrap.realType();
        fields = { ...fields, ...modifierFieldsForType(field, realType) };
        if (wrap.isMany()) {

        }
      }
    });
    type._fields = fields;
    type.process = async ({ where, sort, skip, limit }, context, info) => {
      let selector = await asyncMapValues(where, async (value, key) => {
        let field = type._fields[key];
        return await field.process(value, context, info);
      });

      let options = {
        sort,
        skip,
        limit,
      };

      return await initialType.find(selector, options);
    };
  };

  _fillWhereUniqueInputObject = ({ type, initialType, kind }) => {
    type._fields = Object.entries(initialType._fields)
      .filter(([name, field]) => field.unique)
      .reduce((fields = {}, [name, field]) => {
        fields[name] = {
          name,
          type: field.type,
          process: (value, context, info) => value,
        };
        return fields;
      });
    type.process = async ({ where }, context, info) => {
      let selector = await asyncMapValues(where, async (value, key) => {
        let field = type._fields[key];
        return await field.process(value, context, info);
      });

      let key = Object.keys(selector)[0];
      let value = selector[key];

      return await initialType.findUnique(key, value, context, info);
    };
  };

  _fillRelationCreateInputObject = ({ type, initialType, subType, kind, isMany = false }) => {
    let createType = Types.inputFor(KIND.CREATE, subType);
    let whereUniqueType = Types.inputFor(KIND.WHERE_UNIQUE, subType);
    if (isMany) {
      createType = new GraphQLList(createType);
      whereUniqueType = new GraphQLList(whereUniqueType);
    }
    type._fields = {
      connect: {
        name: 'connect',
        type: whereUniqueType,
      },
      create: {
        name: 'create',
        type: createType,
      },
    };


  };

  _fillRelationUpdateInputObject = ({ type, initialType, subType, kind, isMany = false }) => {
    let createType = Types.inputFor(KIND.CREATE, subType);
    let whereUniqueType = Types.inputFor(KIND.WHERE_UNIQUE, subType);
    let updateType = Types.inputFor(KIND.UPDATE, subType);
    let updateWhereType = Types.inputFor(KIND.UPDATE_WHERE, subType);
    if (isMany) {
      createType = new GraphQLList(createType);
      whereUniqueType = new GraphQLList(whereUniqueType);
      updateWhereType = new GraphQLList(updateWhereType);

    }
    type._fields = {
      connect: {
        name: 'connect',
        type: whereUniqueType,
      },
      create: {
        name: 'create',
        type: createType,
      },
      update: {
        name: 'update',
        type: isMany ? updateWhereType : updateType,
      },
      disconnect: {
        name: 'disconnect',
        type: isMany ? whereUniqueType : GraphQLBoolean,
      },
      delete: {
        name: 'delete',
        type: isMany ? whereUniqueType : GraphQLBoolean,
      },
    };

    if (isMany) {
      type._fields.order = {
        name: 'order',
        type: whereUniqueType,
      };
    }
    type.process = (parent, { connect, create, update, disconnect, delete: del }) => {
      if (connect) {
        
      }
    };
  };

  _fillRelationWhereInputObject = ({ type, initialType, subType, kind }) => {
  };

  _fillEmbeddedCreateInputObject = ({ type, initialType, subType, kind }) => {
  };

  _fillEmbeddedUpdateInputObject = ({ type, initialType, subType, kind }) => {
  };

  _schemaRollback = snapshotTypes => {
    _.difference(
      Object.keys(this.SchemaTypes),
      Object.keys(snapshotTypes),
    ).forEach(typeName => {
      delete this.SchemaTypes[typeName];
    });
  };

  _createObjectType = ({ name, initialType, kind }) => {
    let newType = new GraphQLObjectType({
      name,
      fields: {},
    });
    newType.initialType = initialType;
    newType.getFields();
    return newType;
  };

  _fillPagedObjectType = ({ type, initialType }) => {
    let name = camelize(pluralize(initialType.name));
    let PaginationCursor = this.SchemaTypes['Cursor'];
    type._fields = {
      cursor: {
        name: 'cursor',
        type: new GraphQLNonNull(PaginationCursor),
        description: 'Holds the current pagination information',
      },
      hasMore: {
        type: new GraphQLNonNull(GraphQLBoolean),
        description: 'Does the pagination have more records',
      },
      total: {
        type: new GraphQLNonNull(GraphQLInt),
        description:
          'Total number of records for the provided query without skip and first',
      },
      [name]: {
        type: new GraphQLNonNull(new GraphQLList(initialType)),
        description: 'The records for the current page',
      },
    };
  };

  _createInputType = (name, kind, initialType, subType) => {
    let { init, fill } = this.Kinds[kind];
    if (!init) throw `Unknown kind ${kind}`;

    let snapshotTypes = _.clone(this.SchemaTypes);

    let type = init({ name, initialType, kind, inputTypes: this });
    this.SchemaTypes[name] = type;

    if (fill) {
      try {
        fill({ type, initialType, kind });
      } catch (e) {
        this._schemaRollback(snapshotTypes);
        throw e;
      }
    }
    if (_.isEmpty(type._fields) && _.isEmpty(type._values)) {
      this._schemaRollback(snapshotTypes);
      throw new EmptyTypeException(type);
    }
    return type;
  };

  _inputType = (kind, type, subType, isMany) => {
    if (typeof type === 'string') {
      type = this._type(type);
    }
    if (typeof subType === 'string') {
      subType = this._type(subType);
    }
    let typeName = KIND.inputName(kind, type, subType, isMany);

    try {
      return this._type(typeName);
    } catch (err) {
      return this._createInputType(typeName, kind, type, subType, isMany);
    }
  };

  exist = this._type;
  inputFor = this._inputType;

  registerKind = (kind, init, fill) => {
    if (Array.isArray(kind)) {
      kind.forEach(item => {
        this.registerKind(item, init, fill);
      });
    } else {
      if (this.Kinds[kind]) throw `Kind ${kind} already registered`;
      this.Kinds[kind] = { init, fill };
    }
  };

  setSchemaTypes = schemaTypes => {
    this.SchemaTypes = schemaTypes;
  };
}

const Types = new TypesClass();
export default Types;
