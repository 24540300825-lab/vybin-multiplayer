import sys,struct,numpy as np
sys.path.insert(0,'.')
from blendread import Blend
B=Blend('assets.blend')
LS=B.structs[B.sidx['CustomDataLayer']][2]
def layers(m,cd):
    t,a=B.sub('Mesh',m,cd);lp=B.get('CustomData',a,'layers');n=B.get('CustomData',a,'totlayer');lb=B.block(lp);out={}
    for i in range(n):
        la=lb[5]+i*LS;out.setdefault(B.get('CustomDataLayer',la,'name'),(B.get('CustomDataLayer',la,'type'),B.get('CustomDataLayer',la,'data')))
    return out
def arr(ptr,dt,cols=1):
    r=B.raw(ptr);a=np.frombuffer(r,dtype=dt);return a.reshape(-1,cols) if cols>1 else a
def mesh_of(ob):
    me=B.block(B.get('Object',ob,'data'))
    if not me or B.sname(me)!='Mesh': return None
    m=me[5];nv=B.get('Mesh',m,'totvert');npoly=B.get('Mesh',m,'totpoly');nl=B.get('Mesh',m,'totloop')
    V=layers(m,'vdata');P=layers(m,'pdata');L=layers(m,'ldata')
    pos=arr(V['position'][1],'<f4',3)[:nv]
    off=arr(B.get('Mesh',m,'poly_offset_indices'),'<i4')[:npoly+1]
    cv=arr(L['.corner_vert'][1],'<i4')[:nl]
    uvk=[k for k,(t,p) in L.items() if t==49]; uv=arr(L[uvk[0]][1],'<f4',2)[:nl] if uvk else np.zeros((nl,2),'f4')
    mi=arr(P['material_index'][1],'<i4')[:npoly] if 'material_index' in P else np.zeros(npoly,'i4')
    tc=B.get('Mesh',m,'totcol');mats=[]
    mb=B.block(B.get('Mesh',m,'mat'))
    if mb:
        for p in struct.unpack_from('<%dQ'%tc,B.data,mb[5]):
            bb=B.block(p);mats.append(B.get('ID',B.sub('Material',bb[5],'id')[1],'name')[2:] if bb else None)
    M=np.array(B.get('Object',ob,'obmat'),'f4').reshape(4,4)  # hàng = cột (column-major)
    return dict(pos=pos,off=off,cv=cv,uv=uv,mi=mi,mats=mats,M=M)
def objects():
    out=[]
    for blk in B.blocks_of(b'OB'):
        base=blk[5];idb=B.sub('Object',base,'id')[1];name=B.get('ID',idb,'name')[2:];ad=B.get('ID',idb,'asset_data')
        cat=B.get('AssetMetaData',B.block(ad)[5],'catalog_simple_name') if ad and B.block(ad) else None
        out.append(dict(name=name,cat=cat,ob=base,parent=B.get('Object',base,'parent')))
    return out
if __name__=='__main__':
    import collections
    obs=objects()
    want=sys.argv[1:]
    for o in obs:
        if o['cat'] and any(w in o['cat'] for w in want):
            me=mesh_of(o['ob'])
            if not me: print(o['name'],'(no mesh)');continue
            p=me['pos'];sz=p.max(0)-p.min(0)
            S=np.linalg.norm(me['M'][:3,:3],axis=1)
            print(f"{o['cat'].split('-')[-1]:22s} {o['name']:45s} v{len(p):6d} size{np.round(sz*S,2)} mats{sorted(set(me['mats']))} par{bool(o['parent'])}")
