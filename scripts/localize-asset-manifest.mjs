import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(
  projectRoot,
  'public',
  'models',
  'assets',
  'manifest.json',
);

const names = {
  Armchair: '라운지 의자',
  Box002: '보라색 꽃 화분',
  'Box003.000': '흰색 회의실 의자',
  'Cabinet bookshelf pair': '책이 놓인 회색 책장 세트',
  'Cabinet1.001': '프린터와 책이 있는 나무 캐비닛',
  'Cabinet1.003': '회색 캐비닛',
  'Cabinet1.007': '낮은 캐비닛',
  'Cabinet1.017': '초록색 컵이 있는 나무 캐비닛',
  'Cabinet1.019': '장식품이 있는 나무 캐비닛 1',
  'Cabinet1.023': '장식품이 있는 나무 캐비닛 2',
  'Cabinet1.027': '책이 있는 세로형 캐비닛',
  'Cabinet1.031': '책이 있는 가로형 캐비닛',
  Clock: '벽시계',
  couch1: '사무실 소파',
  'Cube.196': '소형 장식 소품',
  'Cube.221': '벽걸이 사진 1',
  'Cube.224': '벽걸이 사진 2',
  'Cube.225': '벽걸이 사진 3',
  'Cube.226': '상장패 1',
  'Cube.227': '상장패 2',
  'Cube.228': '상장패 3',
  'Cube.229': '탁상용 사진 액자',
  'Cube.230': '벽걸이 사진 4',
  'Cube.231': '빈 화분',
  Door_Group: '외벽 출입문 세트 1',
  'Door_Group.001': '외벽 출입문 세트 2',
  'Door_Group.002': '외벽 출입문 세트 3',
  'Door_Group.009': '실내문 세트 1',
  'Door_Group.010': '실내문 세트 2',
  'Door_Group.011': '실내문 세트 3',
  Floor: '나무 바닥',
  'Meeting table': '회의실 테이블',
  'Monitor_01.003': '컴퓨터 모니터',
  Mug1: '머그컵 1',
  'Mug1.001': '머그컵 2',
  'Office desk 01': '사무실 책상 세트 1',
  'Office desk 02': '사무실 책상 세트 2',
  'Office desk 03': '사무실 책상 세트 3',
  'Office desk 04': '사무실 책상 세트 4',
  'Office desk 05': '사무실 책상 세트 5',
  'Office desk 06': '사무실 책상 세트 6',
  'Office desk 07': '사무실 책상 세트 7',
  'Office desk 08': '사무실 책상 세트 8',
  'Office desk 09': '사무실 책상 세트 9',
  'Office desk 10': '사무실 책상 세트 10',
  'Office desk 11': '사무실 책상 세트 11',
  Office_Chair_Final_PBR: '검은색 사무용 의자',
  'OfficeChair_Modern.012': '회색 사무용 의자',
  'printer.001': '사무실 프린터',
  Projector: '빔프로젝터',
  'Projector Screen': '프로젝터 스크린',
  Reception: '안내 데스크',
  Remote: '프로젝터 리모컨',
  Room: '메인 사무실 벽체',
  'Room.001': '개인 사무실 벽체',
  'Room.002': '회의실 벽체',
  'simple_desk.000': '개인 사무실 책상',
  'Straight partition': '일자형 사무실 파티션',
  Textured: '종이 문서 1',
  'Textured.002': '종이 문서 2',
  u_a_low: '서류 묶음 1',
  'u_a_low.001': '서류 묶음 2',
  'u_a_low.003': '서류 묶음 3',
  'u_a_low.005': '서류 묶음 4',
  'u_a_low.006': '서류 묶음 5',
  wardrobe: '사무실 옷장',
  'water despencer': '정수기',
  Window_Group: '사무실 창문',
};

const collectionNames = {
  Collection: '공용 공간',
  descs: '사무실 책상과 소품',
  'glass room': '유리 회의실',
  'Meeting room': '회의실',
  'michael room': '개인 사무실',
  curated: '정리된 에셋',
  'curated / desks': '사무실 책상',
  'curated / meeting room': '회의실',
  'curated / architecture': '건축 구조물',
};

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const missing = [];

for (const asset of manifest.assets) {
  const originalName = asset.root;
  if (names[originalName]) {
    asset.originalRoot = asset.originalRoot || originalName;
    asset.root = names[originalName];
  } else if (!Object.values(names).includes(originalName)) {
    missing.push(originalName);
  }

  if (collectionNames[asset.collection]) {
    asset.originalCollection =
      asset.originalCollection || asset.collection;
    asset.collection = collectionNames[asset.collection];
  }
}

if (missing.length) {
  throw new Error(`Missing Korean labels: ${missing.join(', ')}`);
}

manifest.locale = 'ko-KR';
manifest.naming = 'GLB filenames remain ASCII; editor display labels are Korean.';

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Localized ${manifest.assets.length} asset labels.`);
