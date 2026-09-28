import 'dart:convert';
import 'dart:io';

/// Responses captured with curl from a local backend (own DB, reference +
/// demo seed, two test accounts "Sara" / "Omar"; every text is test data).
Map<String, dynamic> communityFixture(String name) =>
    jsonDecode(File('test/features/community/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>;

/// `data` of a fixture.
Object? fixtureData(String name) => communityFixture(name)['data'];

const demoVariantId = 'd0000000-0000-4000-8000-000000000014';
const demoModelId = 'd0000000-0000-4000-8000-000000000011';
const demoCarSlug = 'demo-motors-ev-one';
const demoArticleId = 'd0000000-0000-4000-8000-000000000021';
const demoArticleSlug = 'demo-sample-article';
const saraId = '01a0e8db-bd51-71cf-8207-b6f4e0688383';
const omarId = '01a0e8db-beee-763b-8ce3-9d8d942492a4';

/// A deep copy of [json] (fixtures are edited per test).
T copyJson<T>(T json) => jsonDecode(jsonEncode(json)) as T;
