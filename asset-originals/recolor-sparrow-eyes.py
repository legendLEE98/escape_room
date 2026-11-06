import json,struct,sys
src,dst,mode=sys.argv[1],sys.argv[2],sys.argv[3]
f=bytearray(open(src,'rb').read())
l=struct.unpack('<I',f[12:16])[0]
j=json.loads(bytes(f[20:20+l])); bs=20+l+8
prim=j['meshes'][0]['primitives'][0]
a=j['accessors'][prim['attributes']['TEXCOORD_0']]; bv=j['bufferViews'][a['bufferView']]
o=bs+bv.get('byteOffset',0)+a.get('byteOffset',0); s=bv.get('byteStride') or 8
uv=[struct.unpack_from('<2f',f,o+i*s) for i in range(a['count'])]
def col(i): return round(uv[i][0]*16,1), round(uv[i][1]*4,1)
pupil=next(i for i in range(len(uv)) if col(i)==(15.0,3.0))
white=[i for i in range(len(uv)) if col(i)==(13.0,3.0)]
head=next(i for i in range(len(uv)) if col(i)==(11.0,3.0))
target={'dark':pupil,'head':head,'bead':head,'black':pupil}[mode]
for i in white: struct.pack_into('<2f',f,o+i*s,*uv[target])
if mode in ('bead','black'):
    import zlib
    img=j['images'][0]; ibv=j['bufferViews'][img['bufferView']]
    io=bs+ibv.get('byteOffset',0); png=f[io:io+ibv['byteLength']]
    pos=8
    while pos<len(png):
        ln=struct.unpack('>I',png[pos:pos+4])[0]; typ=bytes(png[pos+4:pos+8])
        if typ==b'PLTE':
            for k in range(ln//3):
                if tuple(png[pos+8+3*k:pos+11+3*k])==(41,41,57):
                    png[pos+8+3*k:pos+11+3*k]=bytes((12,12,18)); print('pupil palette entry',k,'-> near black')
            crc=zlib.crc32(bytes(png[pos+4:pos+8+ln]))&0xffffffff
            png[pos+8+ln:pos+12+ln]=struct.pack('>I',crc)
        pos+=12+ln
    f[io:io+ibv['byteLength']]=png
open(dst,'wb').write(f); print('recolored',len(white),'sclera verts ->',mode)
