import {
  CONSUMED_CAPACITY_TYPE,
  NoSuchEntityExistsError,
  NoSuchIndexFoundError,
} from '@typedorm/common';
import {Organisation} from '@typedorm/core/__mocks__/organisation';
import {table} from '@typedorm/core/__mocks__/table';
import {User} from '@typedorm/core/__mocks__/user';
import {UserUniqueEmail} from '@typedorm/core/__mocks__/user-unique-email';
import {createTestConnection, resetTestConnection} from '@typedorm/testing';
import {Connection} from '../../connection/connection';
import {DocumentClientScanTransformer} from '../document-client-scan-transformer';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('66a7b3d6-323a-49b0-a12d-c99afff5005a'),
}));

let connection: Connection;
let dcScanTransformer: DocumentClientScanTransformer;
beforeEach(() => {
  connection = createTestConnection({
    entities: [User, Organisation, UserUniqueEmail],
    table,
  });
  dcScanTransformer = new DocumentClientScanTransformer(connection);
});

afterEach(() => {
  resetTestConnection();
});

test('correctly extends low order transformers', () => {
  expect(dcScanTransformer.connection).toEqual(connection);
});

test('transforms simple scan input', () => {
  const transformed = dcScanTransformer.toDynamoScanItem();
  expect(transformed).toEqual({TableName: 'test-table'});
});

test('transforms scan input with options', () => {
  const transformed = dcScanTransformer.toDynamoScanItem(
    {
      cursor: {PK: 123},
    },
    {
      returnConsumedCapacity: CONSUMED_CAPACITY_TYPE.TOTAL,
    }
  );

  expect(transformed).toEqual({
    ExclusiveStartKey: {
      PK: 123,
    },
    ReturnConsumedCapacity: 'TOTAL',
    TableName: 'test-table',
  });
});

test('throws when trying to reference invalid index', () => {
  const transformedFactory = () =>
    dcScanTransformer.toDynamoScanItem({
      scanIndex: 'SOME_UNKNOWN_INDEX',
    });

  expect(transformedFactory).toThrow(NoSuchIndexFoundError);
});

test('transforms input with filter and projection', () => {
  const transformed = dcScanTransformer.toDynamoScanItem({
    where: {
      id: {
        EQ: '1',
      },
    },
    select: ['id'],
  });

  expect(transformed).toEqual({
    ExpressionAttributeNames: {
      '#FE_id': 'id',
      '#PE_id': 'id',
    },
    ExpressionAttributeValues: {
      ':FE_id': '1',
    },
    FilterExpression: '#FE_id = :FE_id',
    ProjectionExpression: '#PE_id',
    TableName: 'test-table',
  });
});

test('transforms input with count only', () => {
  const transformed = dcScanTransformer.toDynamoScanItem({
    onlyCount: true,
  });
  expect(transformed).toEqual({
    Select: 'COUNT',
    TableName: 'test-table',
  });
});

test('transforms simple dynamodb output items', () => {
  const transformed = dcScanTransformer.fromDynamoScanResponseItemList([
    {id: '1', __en: 'user', name: 'test-user'},
    {id: 'ORG_1', __en: 'organisation', name: 'test organisation'},
    {
      email: 'some@entity.com',
    },
  ]);

  expect(transformed).toEqual({
    items: [
      {
        id: '1',
        name: 'test-user',
      },
      {
        id: 'ORG_1',
        name: 'test organisation',
      },
    ],
    unknownItems: [
      {
        email: 'some@entity.com',
      },
    ],
  });
});

test('throws for unknown entity name', () => {
  const transformedFactory = () =>
    dcScanTransformer.fromDynamoScanResponseItemList([
      {id: 1, __en: 'unusual entity'},
    ]);

  expect(transformedFactory).toThrow(NoSuchEntityExistsError);
});
