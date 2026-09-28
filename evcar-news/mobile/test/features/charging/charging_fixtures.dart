import 'dart:convert';
import 'dart:io';

/// Responses captured from the real backend (own database, reference +
/// demo seed; every station is a clearly labelled fictional demo row).
Map<String, dynamic> chargingFixture(String name) =>
    jsonDecode(File('test/features/charging/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>;

/// Deep copy so tests can mutate freely.
Map<String, dynamic> copyJson(Map<String, dynamic> json) => jsonDecode(jsonEncode(json)) as Map<String, dynamic>;

const demoStationId = 'd0000000-0000-4000-8000-000000000031';
const demoStation2Id = 'd0000000-0000-4000-8000-000000000037';
