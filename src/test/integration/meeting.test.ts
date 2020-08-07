import { createTestClient } from 'apollo-server-testing';
import { connect, close, Meeting, getManager } from '../../db';
import { apolloServer, queries, mutations } from '../../graphql';

jest.mock('../../env', () => ({
  DB_URL: 'postgresql://rem@localhost:5432/midnightest',
}));

const { query, mutate } = createTestClient(apolloServer);

describe('Meeting operations', () => {
  beforeAll(async () => {
    await connect();
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await getManager().clear(Meeting);
  });

  it('should fetch freshly created meeting from database', async () => {
    const meeting = new Meeting();
    meeting.title = 'testMeeting';
    meeting.startsAt = new Date();
    meeting.endsAt = new Date();

    await getManager().save(meeting);

    const res = await query({
      query: queries.meetings,
      variables: { first: 1 },
    });

    expect(res).toMatchSnapshot({
      data: {
        meetings: {
          edges: [
            {
              node: {
                id: expect.any(String),
                endsAt: expect.any(String),
                startsAt: expect.any(String),
                title: meeting.title,
              },
              cursor: expect.any(String),
            },
          ],
          pageInfo: {
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: expect.any(String),
            endCursor: expect.any(String),
          },
        },
      },
    });
  });

  it('should fetch empty list of meetings', async () => {
    const res = await query({
      query: queries.meetings,
      variables: { first: 1 },
    });

    expect(res).toMatchSnapshot();
  });

  it('should fetch specific meeting', async () => {
    const meeting = new Meeting();
    meeting.title = 'testMeeting';
    meeting.startsAt = new Date();
    meeting.endsAt = new Date();

    await getManager().save(meeting);

    const res = await query({
      query: queries.meeting,
      variables: { id: meeting.id },
    });

    expect(res).toMatchSnapshot({
      data: {
        meeting: {
          id: expect.any(String),
          endsAt: expect.any(String),
          startsAt: expect.any(String),
          title: meeting.title,
        },
      },
    });
  });

  it('should create a new meeting', async () => {
    const title = 'testMeeting';
    const res = await mutate({
      mutation: mutations.createMeeting,
      variables: {
        title,
        startsAt: new Date().toISOString(),
        endsAt: new Date().toISOString(),
      },
    });

    expect(res).toMatchSnapshot({
      data: {
        createMeeting: {
          meeting: {
            id: expect.any(String),
            endsAt: expect.any(String),
            startsAt: expect.any(String),
            title,
          },
        },
      },
    });

    const meeting = await getManager().findOne(Meeting, { title });

    expect(meeting).toBeDefined();
  });

  it('should delete a meeting', async () => {
    const meeting = new Meeting();
    meeting.title = 'testMeeting';
    meeting.startsAt = new Date();
    meeting.endsAt = new Date();

    await getManager().save(meeting);

    const res = await mutate({
      mutation: mutations.deleteMeetings,
    });

    expect(res).toMatchSnapshot({
      data: {
        deleteMeetings: true,
      },
    });

    const meetings = await getManager().find(Meeting);
    expect(meetings).toEqual([]);
  });

  it('should have same end/start cursors & next/previous pages false on one meeting', async () => {
    await insertMeeting();

    const numOfMeetings = 1;

    const res = await query({
      query: queries.meetings,
      variables: { first: numOfMeetings },
    });

    expect(res).toMatchSnapshot(
      meetingSnapshot({ hasPreviousPage: false, hasNextPage: false })
    );

    const { edgeLength, edgeCursor, startCursor, endCursor } = parseRes(res);

    expect(edgeLength).toBe(numOfMeetings);
    expect(edgeCursor).not.toBeUndefined();
    expect(edgeCursor).toBe(startCursor);
    expect(edgeCursor).toBe(endCursor);
  });

  it('should have different end/start cursors & next page true on two meetings', async () => {
    await insertMeeting();
    await insertMeeting();

    const numOfMeetings = 1;

    const res = await query({
      query: queries.meetings,
      variables: { first: numOfMeetings },
    });

    expect(res).toMatchSnapshot(
      meetingSnapshot({ hasPreviousPage: false, hasNextPage: true })
    );

    const { edgeLength, edgeCursor, startCursor, endCursor } = parseRes(res);

    expect(edgeLength).toBe(numOfMeetings);
    expect(edgeCursor).not.toBeUndefined();
    expect(edgeCursor).toBe(startCursor);
    expect(edgeCursor).not.toBe(endCursor);
  });

  it('prev page should be true when getting second meeting', async () => {
    await insertMeeting();
    await insertMeeting();

    const numOfMeetings = 1;

    let res = await query({
      query: queries.meetings,
      variables: { first: numOfMeetings },
    });

    const { edgeCursor: cursor } = parseRes(res);

    res = await query({
      query: queries.meetings,
      variables: { first: numOfMeetings, after: cursor },
    });

    expect(res).toMatchSnapshot(
      meetingSnapshot({ hasPreviousPage: true, hasNextPage: false })
    );

    const { edgeLength, edgeCursor, startCursor, endCursor } = parseRes(res);

    expect(edgeLength).toBe(numOfMeetings);
    expect(edgeCursor).not.toBeUndefined();
    expect(edgeCursor).not.toBe(startCursor);
    expect(edgeCursor).toBe(endCursor);
  });

  it('prev/next pages should be true when getting second from many meetings', async () => {
    await insertMeeting();
    await insertMeeting();
    await insertMeeting();

    const numOfMeetings = 1;

    let res = await query({
      query: queries.meetings,
      variables: { first: numOfMeetings },
    });

    const { edgeCursor: cursor } = parseRes(res);

    res = await query({
      query: queries.meetings,
      variables: { first: numOfMeetings, after: cursor },
    });

    expect(res).toMatchSnapshot(
      meetingSnapshot({ hasPreviousPage: true, hasNextPage: true })
    );

    const { edgeLength, edgeCursor, startCursor, endCursor } = parseRes(res);

    expect(edgeLength).toBe(1);
    expect(edgeCursor).not.toBeUndefined();
    expect(edgeCursor).not.toBe(startCursor);
    expect(edgeCursor).not.toBe(endCursor);
  });

  it('prev page should be true after fetching from specific date', async () => {
    await insertMeeting(new Date('1980'));
    await insertMeeting(new Date('2020-02-02'));
    await insertMeeting(new Date('2020-02-02'));

    const numOfMeetings = 2;

    const res = await query({
      query: queries.meetings,
      variables: { first: numOfMeetings, after: '2020' },
    });

    expect(res).toMatchSnapshot(
      meetingSnapshot({
        hasPreviousPage: true,
        hasNextPage: false,
        numOfMeetings,
      })
    );

    const { edgeLength } = parseRes(res);

    expect(edgeLength).toBe(numOfMeetings);
  });
});

const insertMeeting = async (startsAt?: Date) => {
  const meeting = new Meeting();
  meeting.title = 'testMeeting';
  meeting.startsAt = startsAt || new Date();
  meeting.endsAt = new Date();

  await getManager().save(meeting);

  return meeting;
};

const meetingSnapshot = (options: {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  numOfMeetings?: number;
}) => {
  const { hasNextPage, hasPreviousPage, numOfMeetings = 1 } = options;
  const snp = {
    data: {
      meetings: {
        edges: [
          {
            node: {
              id: expect.any(String),
              endsAt: expect.any(String),
              startsAt: expect.any(String),
              title: 'testMeeting',
            },
            cursor: expect.any(String),
          },
        ],
        pageInfo: {
          hasNextPage,
          hasPreviousPage,
          startCursor: expect.any(String),
          endCursor: expect.any(String),
        },
      },
    },
  };

  for (let i = 1; i < numOfMeetings; i++) {
    snp.data.meetings.edges.push({
      node: {
        id: expect.any(String),
        endsAt: expect.any(String),
        startsAt: expect.any(String),
        title: 'testMeeting',
      },
      cursor: expect.any(String),
    });
  }

  return snp;
};

const parseRes = (res: any) => {
  const edgeLength = res.data?.meetings.edges.length;
  const edgeCursor = res.data?.meetings.edges[0].cursor;
  const startCursor = res.data?.meetings.pageInfo.startCursor;
  const endCursor = res.data?.meetings.pageInfo.endCursor;

  return {
    edgeLength,
    edgeCursor,
    startCursor,
    endCursor,
  };
};