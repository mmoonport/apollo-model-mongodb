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

const parseJSON = val => {
  if (typeof val === "object") {
    return val;
  } else if (typeof val === "string") {
    return JSON.parse(val);
  }

  return val;
};

const resolvers = {
  JSON: new _graphql.GraphQLScalarType({
    name: 'JSON',
    description: 'JSON Scalar. returns ',
    serialize: val => val,
    parseValue: val => parseJSON(val),
    parseLiteral: ast => parseJSON(ast.value)
  })
};
exports.resolvers = resolvers;