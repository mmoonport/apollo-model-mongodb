"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.schemaDirectives = exports.typeDef = void 0;

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

var _graphqlTools = require("graphql-tools");

var _utils = require("../../inputTypes/utils");

var _transforms = require("../../inputTypes/transforms");

var _handlers = require("../../inputTypes/handlers");

var _kinds = require("../../inputTypes/kinds");

var _graphql = require("graphql");

var _typeWrap = _interopRequireDefault(require("../../typeWrap"));

const typeDef = `directive @default(value: String!) on FIELD_DEFINITION`;
exports.typeDef = typeDef;

class DefaultDirective extends _graphqlTools.SchemaDirectiveVisitor {
  constructor(...args) {
    super(...args);
    (0, _defineProperty2.default)(this, "_setDefaultValue", (fieldName, defaultValue) => params => {
      let value = params[fieldName];

      if (value === undefined || value === null) {
        params[fieldName] = defaultValue;
      }

      return params;
    });
  }

  visitFieldDefinition(field) {
    let {
      value
    } = this.args;
    let typeWrap = new _typeWrap.default(field.type);
    let realType = typeWrap.realType();

    try {
      switch (realType.name) {
        case 'Float':
          value = parseFloat(value);
          break;

        case 'Int':
          value = parseInt(value);
          break;

        default:
          value = JSON.parse(value);
          break;
      }
    } catch (e) {//skip parsing error
    }

    (0, _utils.appendTransform)(field, _handlers.TRANSFORM_TO_INPUT, {
      [_kinds.CREATE]: ({
        field
      }) => [{
        name: field.name,
        type: field.type,
        mmTransformAlways: (0, _utils.reduceTransforms)([this._setDefaultValue(field.name, value), (0, _transforms.fieldInputTransform)(field, _kinds.CREATE)])
      }]
    });
    let resolve = field.resolve || _graphql.defaultFieldResolver;

    field.resolve = async (parent, args, context, info) => {
      let result = await resolve(parent, args, context, info);

      if (result === undefined || result === null) {
        result = value;
      }

      return result;
    };
  }

}

const schemaDirectives = {
  default: DefaultDirective
};
exports.schemaDirectives = schemaDirectives;