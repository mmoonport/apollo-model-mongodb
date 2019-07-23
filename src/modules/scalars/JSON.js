import { GraphQLScalarType, Kind } from 'graphql';
import gql from 'graphql-tag';

export const typeDef = gql`
  scalar JSON
`;


const parseJSON = val => {
  if(typeof val === "object") {
    return val;
  }else if(typeof val === "string") {
    return JSON.parse(val);
  }
  return val;
};

export const resolvers = {
  JSON: new GraphQLScalarType({
    name: 'JSON',
    description: 'JSON Scalar. returns ',
    serialize: val => val,
    parseValue: val => parseJSON(val),
    parseLiteral: ast => parseJSON(ast.value),
  }),
};
