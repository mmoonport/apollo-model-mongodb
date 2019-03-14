"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resolvers = exports.typeDef = void 0;

var _graphql = require("graphql");

var _graphqlTag = _interopRequireDefault(require("graphql-tag"));

const typeDef = _graphqlTag.default`
  scalar Date
`;
exports.typeDef = typeDef;
const resolvers = {
  Date: new _graphql.GraphQLScalarType({
    name: 'Date',
    description: 'Date type',
    serialize: val => val instanceof Date ? val.toISOString() : val,
    parseValue: val => new Date(val),
    parseLiteral: ast => ast.kind === _graphql.Kind.STRING ? new Date(ast.value) : ast.value
  })
};
exports.resolvers = resolvers;