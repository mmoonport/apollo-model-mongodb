"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resolvers = exports.typeDef = void 0;

var _graphql = require("graphql");

var _graphqlTag = _interopRequireDefault(require("graphql-tag"));

const typeDef = _graphqlTag.default`
  scalar JSON
`;
exports.typeDef = typeDef;
const resolvers = {
  JSON: new _graphql.GraphQLScalarType({
    name: 'JSON',
    description: 'JSON Scalar. returns ',
    serialize: val => val,
    parseValue: val => JSON.parse(val),
    parseLiteral: ast => {
      try {
        return JSON.parse(ast.value);
      } catch (e) {
        return ast.value;
      }
    }
  })
};
exports.resolvers = resolvers;