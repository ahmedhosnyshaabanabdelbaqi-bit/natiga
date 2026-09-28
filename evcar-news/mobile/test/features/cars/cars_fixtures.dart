import 'dart:convert';
import 'dart:io';

/// Real responses of the public catalog API captured from a local backend
/// running the DEMO seed (every record is fictional and flagged `isDemo`).
/// Captured 2026-09-25 with `curl http://localhost:3107/api/v1/...`.
Map<String, dynamic> fixture(String name) =>
    jsonDecode(File('test/features/cars/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>;

/// Deep copy (tests mutate fixtures freely).
Map<String, dynamic> copyJson(Map<String, dynamic> json) => jsonDecode(jsonEncode(json)) as Map<String, dynamic>;

const demoCarSlug = 'demo-motors-ev-one';
const demoBevId = 'd0000000-0000-4000-8000-000000000014';
const demoBevSlug = 'demo-ev-one-2025-standard-bev';
const demoPhevId = 'd0000000-0000-4000-8000-000000000015';
const demoPhevSlug = 'demo-ev-one-2025-standard-phev';
const demoTourId = 'd0000000-0000-4000-8000-000000000053';
