"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getLastType = getLastType;
exports.getDirective = getDirective;
exports.getDirectiveArg = getDirectiveArg;
exports.lowercaseFirstLetter = lowercaseFirstLetter;
exports.getRelationFieldName = getRelationFieldName;
exports.hasQLListType = hasQLListType;
exports.hasQLNonNullType = hasQLNonNullType;
exports.cloneSchema = cloneSchema;
exports.cloneSchemaOptional = cloneSchemaOptional;
exports.asyncForEach = asyncForEach;
exports.asyncMapValues = asyncMapValues;
exports.allQueryArgs = allQueryArgs;
exports.combineResolvers = combineResolvers;
exports.prepareUpdateDoc = prepareUpdateDoc;

var _graphql = require("graphql");

var _graphqlResolvers = require("graphql-resolvers");

var _lodash = _interopRequireDefault(require("lodash"));

var _pluralize = _interopRequireDefault(require("pluralize"));

var _queryExecutor = require("./queryExecutor");

function getLastType(fieldType) {
  if (fieldType.ofType) {
    return getLastType(fieldType.ofType);
  }

  return fieldType;
}

function getDirective(field, name) {
  if (field.astNode && field.astNode.directives) {
    return field.astNode.directives.find(directive => directive.name.value === name);
  }

  return undefined;
}

function getDirectiveArg(directive, name, defaultValue) {
  let arg = directive.arguments.find(argument => argument.name.value === name);
  if (arg) return arg.value.value;else {
    return defaultValue;
  }
}

function camelize(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (letter, index) {
    return index === 0 ? letter.toLowerCase() : letter.toUpperCase();
  }).replace(/\s+/g, '');
}

function lowercaseFirstLetter(string) {
  if (typeof string === 'string') {
    return string.charAt(0).toLowerCase() + string.slice(1);
  }

  return string;
}

function getRelationFieldName(collection, field, many = false) {
  field = field.replace('_', '');

  if (many) {
    field = (0, _pluralize.default)(field);
  }

  return camelize(`${collection} ${field}`);
}

function hasQLListType(fieldType) {
  if (fieldType instanceof _graphql.GraphQLList) {
    return true;
  }

  if (fieldType.ofType) {
    return hasQLListType(fieldType.ofType);
  }

  return false;
}

function hasQLNonNullType(fieldType) {
  if (fieldType instanceof _graphql.GraphQLNonNull) {
    return true;
  }

  if (fieldType.ofType) {
    return hasQLListType(fieldType.ofType);
  }

  return false;
}

function cloneSchema(schema, type) {
  if (schema instanceof _graphql.GraphQLNonNull) {
    return new _graphql.GraphQLNonNull(cloneSchema(schema.ofType, type));
  }

  if (schema instanceof _graphql.GraphQLList) {
    return new _graphql.GraphQLList(cloneSchema(schema.ofType, type));
  }

  return type;
}

function cloneSchemaOptional(schema, type) {
  if (schema instanceof _graphql.GraphQLNonNull) {
    return cloneSchema(schema.ofType, type);
  }

  if (schema instanceof _graphql.GraphQLList) {
    return new _graphql.GraphQLList(cloneSchema(schema.ofType, type));
  }

  return type;
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

async function asyncMapValues(object, callback) {
  let newObject = {};
  await asyncForEach(Object.keys(object), async key => {
    let value = object[key];
    newObject[key] = await callback(value, key, object);
  });
  return newObject;
}

function allQueryArgs({
  whereType,
  orderByType
}) {
  return [{
    name: 'where',
    description: null,
    type: whereType,
    defaultValue: undefined
  }, {
    name: 'orderBy',
    description: null,
    type: orderByType,
    defaultValue: undefined
  }, {
    name: 'skip',
    description: null,
    type: _graphql.GraphQLInt,
    defaultValue: undefined
  }, {
    name: 'first',
    description: null,
    type: _graphql.GraphQLInt,
    defaultValue: undefined
  }];
} //
// export function GraphQLTypeFromString(type) {
//   switch (type) {
//     case 'ID':
//       return GraphQLID;
//     case 'Int':
//       return GraphQLInt;
//     case 'String':
//       return GraphQLString;
//     case 'ObjectID':
//       return Scalars.ObjectID;
//   }
// }


function combineResolvers(...args) {
  args = args.filter(arg => arg);
  return (0, _graphqlResolvers.combineResolvers)(...args);
}

function checkForModifiers(value) {
  return _lodash.default.isObject(value) && value instanceof Date === false && !Array.isArray(value);
}

function isSet(value) {
  return Array.isArray(value) || value instanceof Date === true || !_lodash.default.isObject(value) || Object.keys(value).length > 0;
}

function prepareUpdateDoc(doc) {
  doc = _lodash.default.cloneDeep(doc); // console.log({doc});

  let set = {};
  let unset = {};
  let push = {};
  let pull = {};
  let pullAll = {};
  let arrayFilters = [];
  let validations = {};
  let postResolvers = {};
  Object.keys(doc).forEach(path => {
    let value = doc[path];

    if (checkForModifiers(value)) {
      Object.keys(value).forEach(key => {
        let val = value[key];
        let resolve;

        switch (key) {
          case '$mmPushAll':
            push[path] = {
              $each: val
            };
            delete value[key];
            break;

          case '$mmArrayFilter':
            arrayFilters.push(val);
            delete value[key];
            break;

          case '$mmPull':
            pull[path] = val;
            delete value[key];
            break;

          case '$mmPullAll':
            pullAll[path] = val;
            delete value[key];
            break;

          case '$mmUnset':
            unset[path] = true;
            delete value[key];
            break;

          case '$mmExists':
            validations[path] = {
              $exists: val
            };
            delete value[key];
            break;

          case '$mmEquals':
            validations[path] = {
              $equals: val
            };
            delete value[key];
            break;

          case '$mmDeleteSingleRelation':
            resolve = {
              fieldName: path,
              ...val
            };
            postResolvers[_queryExecutor.DELETE_ONE] ? postResolvers[_queryExecutor.DELETE_ONE].push(resolve) : postResolvers[_queryExecutor.DELETE_ONE] = [resolve];
            delete value[key];
            break;

          case '$mmConnectExtRealtion':
            resolve = {
              fieldName: path,
              ...val
            };
            postResolvers[_queryExecutor.UPDATE_ONE] ? postResolvers[_queryExecutor.UPDATE_ONE].push(resolve) : postResolvers[_queryExecutor.UPDATE_ONE] = [resolve];
            break;

          case '$mmDisconnectExtRelation':
            resolve = {
              fieldName: path,
              ...val
            };
            postResolvers[_queryExecutor.UPDATE_ONE] ? postResolvers[_queryExecutor.UPDATE_ONE].push(resolve) : postResolvers[_queryExecutor.UPDATE_ONE] = [resolve];
            break;

          case '$mmCreateExtRealtion':
            resolve = {
              fieldName: path,
              ...val
            };
            postResolvers[_queryExecutor.INSERT_ONE] ? postResolvers[_queryExecutor.INSERT_ONE].push(resolve) : postResolvers[_queryExecutor.INSERT_ONE] = [resolve];
            break;

          case '$mmDeleteExtRelation':
            resolve = {
              fieldName: path,
              ...val
            };
            postResolvers[_queryExecutor.DELETE_ONE] ? postResolvers[_queryExecutor.DELETE_ONE].push(resolve) : postResolvers[_queryExecutor.DELETE_ONE] = [resolve];
            break;
        }
      });
    }

    if (isSet(value)) {
      set[path] = value;
    }
  });
  let newDoc = {};

  if (!_lodash.default.isEmpty(set)) {
    newDoc.$set = set;
  }

  if (!_lodash.default.isEmpty(unset)) {
    newDoc.$unset = unset;
  }

  if (!_lodash.default.isEmpty(push)) {
    newDoc.$push = push;
  }

  if (!_lodash.default.isEmpty(pull)) {
    newDoc.$pull = pull;
  }

  if (!_lodash.default.isEmpty(pullAll)) {
    newDoc.$pullAll = pullAll;
  } // console.log(newDoc);
  // console.log({ validations });
  // console.log({ arrayFilters });


  return {
    doc: newDoc,
    validations,
    arrayFilters,
    postResolvers
  };
}