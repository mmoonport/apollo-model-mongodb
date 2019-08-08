"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.schemaDirectives = exports.typeDef = exports.MODEL_WITH_EMBEDDED = exports.MULTIPLE_MODEL = void 0;

var _graphqlTools = require("graphql-tools");

var _pluralize = _interopRequireDefault(require("pluralize"));

var _sdlSyntaxException = _interopRequireDefault(require("../../sdlSyntaxException"));

var _utils = require("../../utils");

const MULTIPLE_MODEL = 'multipleModel';
exports.MULTIPLE_MODEL = MULTIPLE_MODEL;
const MODEL_WITH_EMBEDDED = 'modelWithEmbedded';
exports.MODEL_WITH_EMBEDDED = MODEL_WITH_EMBEDDED;
const typeDef = `directive @model(collection:String=null) on OBJECT | INTERFACE`;
exports.typeDef = typeDef;

class Model extends _graphqlTools.SchemaDirectiveVisitor {
  visitObject(object) {
    const {
      collection
    } = this.args;
    object.mmCollectionName = collection || (0, _utils.lowercaseFirstLetter)((0, _pluralize.default)(object.name)); //validate usage

    object._interfaces.forEach(iface => {
      if ((0, _utils.getDirective)(iface, 'model')) {
        throw new _sdlSyntaxException.default(`Type '${object.name}' can not be marked with @model directive because it's interface ${iface.name} marked with @model directive`, MULTIPLE_MODEL, [object, iface]);
      }

      if ((0, _utils.getDirective)(iface, 'embedded')) {
        throw new _sdlSyntaxException.default(`Type '${object.name}' can not be marked with @model directive because it's interface ${iface.name} marked with @embedded directive`, MODEL_WITH_EMBEDDED, [object, iface]);
      }
    });
  }

  visitInterface(iface) {
    const {
      collection
    } = this.args;
    iface.mmCollectionName = collection || (0, _utils.lowercaseFirstLetter)((0, _pluralize.default)(iface.name));
    const {
      _typeMap: SchemaTypes
    } = this.schema;
    Object.values(SchemaTypes).filter(type => type._interfaces && type._interfaces.includes(iface)).forEach(type => {
      type.mmCollectionName = iface.mmCollectionName; //validate usage

      type._interfaces.filter(i => i !== iface).forEach(i => {
        if ((0, _utils.getDirective)(i, 'model')) {
          throw new _sdlSyntaxException.default(`Type '${type.name}' can not inherit both '${iface.name}' and '${i.name}' because they marked with @model directive`, MULTIPLE_MODEL, [i, iface]);
        }

        if ((0, _utils.getDirective)(i, 'embedded')) {
          throw new _sdlSyntaxException.default(`Type '${type.name}' can not inherit both '${iface.name}' and '${i.name}' because they marked with @model and @embedded directives`, MODEL_WITH_EMBEDDED, [i, iface]);
        }
      });
    }); // iface.mmOnSchemaInit = () => {
    //   Object.values(SchemaTypes)
    //     .filter(
    //       type =>
    //         Array.isArray(type._interfaces) && type._interfaces.includes(iface)
    //     )
    //     .forEach(type => {
    //       type.mmDiscriminatorField = iface.mmDiscriminatorField;
    //       iface.mmDiscriminatorMap[type.mmDiscriminator] = type.name;
    //     });
    // };
    // iface.resolveType = doc => {
    //   return iface.mmDiscriminatorMap[doc[iface.mmDiscriminatorField]];
    // };
    ////////////
  }

}

const schemaDirectives = {
  model: Model
};
exports.schemaDirectives = schemaDirectives;