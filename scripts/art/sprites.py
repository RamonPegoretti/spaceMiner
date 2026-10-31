import numpy as np, math, random, json
from PIL import Image
OUT='out/'
def hx(h):
    h=h.lstrip('#'); return (int(h[0:2],16),int(h[2:4],16),int(h[4:6],16),255)
K=hx('#07050d'); T=(0,0,0,0)
def new(w,h): return np.zeros((h,w,4),dtype=np.uint8)
def put(a,x,y,c):
    if 0<=x<a.shape[1] and 0<=y<a.shape[0]: a[y,x]=c
def rect(a,x,y,w,h,c):
    for j in range(y,y+h):
        for i in range(x,x+w): put(a,i,j,c)
def outline(a,c=K):
    h,w=a.shape[:2]; b=a.copy()
    op=a[:,:,3]>0
    for y in range(h):
        for x in range(w):
            if not op[y,x]:
                for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                    xx,yy=x+dx,y+dy
                    if 0<=xx<w and 0<=yy<h and op[yy,xx]: b[y,x]=c;break
    return b
def pad(a,p=1):
    h,w=a.shape[:2]; b=new(w+2*p,h+2*p); b[p:p+h,p:p+w]=a; return b
def save(a,name,scale):
    im=Image.fromarray(a,'RGBA'); im=im.resize((im.width*scale,im.height*scale),Image.NEAREST); im.save(OUT+name+'.png'); return im
def paste(dst,src,x,y):
    h,w=src.shape[:2]
    for j in range(h):
        for i in range(w):
            if src[j,i,3]>0:
                xx,yy=x+i,y+j
                if 0<=xx<dst.shape[1] and 0<=yy<dst.shape[0]: dst[yy,xx]=src[j,i]
BAYER=np.array([[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]])/16.0

RAMPS={
 'iron':['#3a1d14','#6b3222','#a5512f','#d77a45','#f2a66b'],
 'nickel':['#3b3833','#6a655b','#9e978a','#cfc8b6','#f1ecdc'],
 'ice':['#13304a','#1f5b80','#3593bf','#6fd0ee','#c8f4ff'],
 'sil':['#2a1a4a','#4a2f80','#7550b8','#a383e8','#d4c2ff'],
}
VEIN={'iron':'#cfc8b6','nickel':'#f2a66b','ice':'#ffffff','sil':'#ffe08a'}
def asteroid(s,kind,seed,veins=0.04):
    rnd=random.Random(seed); ramp=[hx(c) for c in RAMPS[kind]]
    a=new(s,s); c=(s-1)/2; r=s/2-1.2
    ph=[rnd.uniform(0,6.28) for _ in range(4)]; am=[rnd.uniform(0.05,0.14) for _ in range(4)]
    craters=[(rnd.uniform(c-r*0.5,c+r*0.5),rnd.uniform(c-r*0.5,c+r*0.5),rnd.uniform(0.9,max(1.2,s/7))) for _ in range(max(1,s//6))]
    for y in range(s):
        for x in range(s):
            dx,dy=x-c,y-c; d=math.hypot(dx,dy); ang=math.atan2(dy,dx)
            rr=r*(1+sum(am[k]*math.sin((k+2)*ang+ph[k]) for k in range(4)))
            if d<rr:
                nx,ny=dx/rr,dy/rr; nz=math.sqrt(max(0,1-nx*nx-ny*ny))
                L=(-0.55*nx-0.6*ny+0.6*nz)
                for (cx,cy,cr) in craters:
                    cd=math.hypot(x-cx,y-cy)
                    if cd<cr: L-=0.35
                    elif cd<cr+1 and (x-cx)+(y-cy)>0: L+=0.2
                v=(L+0.35)/1.15 + (BAYER[y%4,x%4]-0.5)*0.22
                idx=int(max(0,min(4,round(v*4))))
                a[y,x]=ramp[idx]
                if rnd.random()<veins and idx>=1: a[y,x]=hx(VEIN[kind])
    return outline(pad(a))

def from_map(rows,pal):
    h=len(rows); w=max(len(r) for r in rows); a=new(w,h)
    for y,r in enumerate(rows):
        for x,ch in enumerate(r):
            if ch in pal: a[y,x]=hx(pal[ch]) if isinstance(pal[ch],str) else pal[ch]
    return a
def mirror_half(rows,dark):
    out=[]
    for r in rows:
        left=r; right=''.join(dark.get(ch,ch) for ch in reversed(r[:-1])); out.append(left+right)
    return out

SHIP_HALF=[
"......k",
".....kl",
".....kg",
"....kmg",
"....kmm",
".kkkdmm",
"kcckdml",
"kCckdml",
"kcckdml",
"kcckdmm",
"kkkkdmm",
"..kydmd",
"..kkkdk",
"...kffk",
"....kF.",
]
SHIP_PAL={'k':'#07050d','l':'#e8dcc0','m':'#a8946e','d':'#5e4e3c','g':'#5fd3f5','c':'#d77a45','C':'#f2a66b','y':'#ffcc33','f':'#ff7a2e','F':'#ffe08a','n':'#3a3026','b':'#8f4a2a'}
ship=from_map(mirror_half(SHIP_HALF,{'l':'m','m':'d','d':'n','c':'b','C':'c'}),SHIP_PAL)

def shaded_disc(a,cx,cy,r,ramp,light=(-0.6,-0.6,0.55),dither=0.2):
    for y in range(int(cy-r-1),int(cy+r+2)):
        for x in range(int(cx-r-1),int(cx+r+2)):
            dx,dy=x-cx,y-cy; d=math.hypot(dx,dy)
            if d<=r:
                nx,ny=dx/r,dy/r; nz=math.sqrt(max(0,1-nx*nx-ny*ny))
                L=light[0]*nx+light[1]*ny+light[2]*nz
                v=(L+0.3)/1.1+(BAYER[y%4,x%4]-0.5)*dither
                put(a,x,y,hx(ramp[int(max(0,min(len(ramp)-1,round(v*(len(ramp)-1)))))]))
METAL=['#1f1812','#3d2f22','#6b5440','#a08868','#d6c3a0']
def foundry():
    a=new(26,26)
    for (x,y,w,h) in [(11,0,4,6),(11,20,4,6),(0,11,6,4),(20,11,6,4)]:
        rect(a,x,y,w,h,hx(METAL[2])); rect(a,x,y,w,1,hx(METAL[3]))
    for (x,y) in [(12,0),(12,25),(0,12),(25,12)]: put(a,x,y,hx('#ffcc33'))
    shaded_disc(a,12.5,12.5,9,METAL)
    shaded_disc(a,12.5,12.5,5,['#1f1812','#3d2f22'],dither=0)
    shaded_disc(a,12.5,12.5,3.2,['#8f2a10','#ff7a2e','#ffcc33','#fff2c0'],light=(0,0,1),dither=0.3)
    for ang in range(0,360,45):
        x=12.5+7.2*math.cos(math.radians(ang)); y=12.5+7.2*math.sin(math.radians(ang)); put(a,int(round(x)),int(round(y)),hx('#1f1812'))
    return outline(pad(a))
def junction():
    a=new(21,21); c=10
    for y in range(21):
        for x in range(21):
            if abs(x-c)+abs(y-c)<=9:
                v=0.5-0.06*((x-c)+(y-c))/2+(BAYER[y%4,x%4]-0.5)*0.15
                a[y,x]=hx(METAL[int(max(1,min(4,round(v*4))))])
            if abs(x-c)+abs(y-c)<=4: a[y,x]=hx(METAL[1])
    for (x,y) in [(c,2),(c,18),(2,c),(18,c)]: put(a,x,y,hx('#ffcc33'))
    shaded_disc(a,c,c,2.2,['#1f5b80','#5fd3f5','#c8f4ff'],light=(0,0,1),dither=0.2)
    return outline(pad(a))
def gate():
    a=new(28,28); c=13.5
    for y in range(28):
        for x in range(28):
            d=math.hypot(x-c,y-c)
            if d<=8.5:
                ang=math.atan2(y-c,x-c); sw=math.sin(ang*3+d*0.7)
                v=0.5+0.35*sw+(BAYER[y%4,x%4]-0.5)*0.4
                pal=['#1a1040','#3b2a80','#6a4fd0','#5fd3f5','#c8f4ff']
                a[y,x]=hx(pal[int(max(0,min(4,round(v*4*(1-d/12)+ (1 if d<3 else 0)))))])
            elif d<=12.5:
                nx=(x-c)/d; ny=(y-c)/d; L=-0.6*nx-0.6*ny
                v=0.5+0.4*L+(BAYER[y%4,x%4]-0.5)*0.2
                a[y,x]=hx(METAL[int(max(1,min(4,round(v*4))))])
    for ang in (45,135,225,315):
        put(a,int(round(c+10.5*math.cos(math.radians(ang)))),int(round(c+10.5*math.sin(math.radians(ang)))),hx('#ff7a2e'))
    return outline(pad(a))
def sun(r=15):
    s=int(r*2+12); a=new(s,s); c=(s-1)/2
    ramp=['#ff7a2e','#ffb02e','#ffcc33','#ffe890','#fffbe6']
    for y in range(s):
        for x in range(s):
            d=math.hypot(x-c,y-c)
            if d<=r:
                v=1-(d/r)**2*0.8+(BAYER[y%4,x%4]-0.5)*0.25
                a[y,x]=hx(ramp[int(max(0,min(4,round(v*4))))])
            elif d<=r+5:
                t=(d-r)/5
                if BAYER[y%4,x%4] > t*1.1+0.15: a[y,x]=hx('#ff7a2e') if t<0.5 else hx('#8f2a10')
    return a

# ---------- factory tiles (16px) ----------
FLOOR=['#120d0a','#1e1712','#2a2019','#3a2d22','#4d3b2a']
def floor_tile():
    a=new(16,16); rect(a,0,0,16,16,hx(FLOOR[2]))
    rect(a,0,0,16,1,hx(FLOOR[3])); rect(a,0,0,1,16,hx(FLOOR[3]))
    rect(a,0,15,16,1,hx(FLOOR[1])); rect(a,15,0,1,16,hx(FLOOR[1]))
    for (x,y) in [(2,2),(13,2),(2,13),(13,13)]: put(a,x,y,hx(FLOOR[4])); put(a,x+1,y+1,hx(FLOOR[0]))
    for i in range(5): put(a,5+i*2,8,hx(FLOOR[1]))
    return a
def belt(direction='down',item=None,phase=0):
    a=new(16,16)
    rect(a,1,0,14,16,hx('#16110d'))
    rect(a,1,0,2,16,hx('#6b5440')); rect(a,1,0,1,16,hx('#a08868'))
    rect(a,13,0,2,16,hx('#3d2f22')); rect(a,14,0,1,16,hx('#6b5440'))
    for k in range(2):
        y0=(k*8+phase)%16
        for i in range(4):
            put(a,4+i,y0+i,hx('#5a4a2a')); put(a,11-i,y0+i,hx('#5a4a2a'))
            put(a,4+i,y0+i+1,hx('#8a7434')); put(a,11-i,y0+i+1,hx('#8a7434'))
    if item:
        ramp=RAMPS[item] if item in RAMPS else None
        cols=[hx(c) for c in (ramp if ramp else ['#3b3833','#9e978a','#cfc8b6','#f1ecdc','#ffffff'])]
        rect(a,6,5,4,4,cols[2]); put(a,6,5,cols[3]); put(a,7,5,cols[4]); put(a,9,8,cols[1]); put(a,8,8,cols[1])
        for x in range(5,11): put(a,x,4,K); put(a,x,9,K)
        for y in range(5,9): put(a,5,y,K); put(a,10,y,K)
    if direction=='right': a=np.rot90(a,1).copy()
    if direction=='left': a=np.rot90(a,-1).copy()
    return a
def hazard_edge(a,x,y,w):
    for i in range(w):
        put(a,x+i,y,hx('#ffcc33') if ((i//2)%2==0) else hx('#07050d'))
def block(a,x,y,w,h,ramp=METAL):
    rect(a,x,y,w,h,hx(ramp[2])); rect(a,x,y,w,1,hx(ramp[3])); rect(a,x,y,1,h,hx(ramp[3]))
    rect(a,x,y+h-1,w,1,hx(ramp[1])); rect(a,x+w-1,y,1,h,hx(ramp[1])); put(a,x,y,hx(ramp[4]))
def light(a,x,y,col):
    c={'g':('#2f8a4a','#6fe08a','#d8ffd8'),'o':('#8f4a10','#ff7a2e','#ffe08a'),'r':('#7a1010','#ff3b3b','#ffd0d0')}[col]
    rect(a,x,y,2,2,hx(c[1])); put(a,x,y,hx(c[2])); put(a,x+1,y+1,hx(c[0]))
def intake(kind):
    a=new(32,32); block(a,1,1,30,30)
    rect(a,5,5,22,22,hx('#1f1812')); rect(a,6,6,20,20,hx('#120d0a'))
    hazard_edge(a,5,4,22); hazard_edge(a,5,27,22)
    rnd=random.Random(kind)
    for i in range(7):
        r=asteroid(rnd.choice([5,6,7]),kind,rnd.randint(0,999),0.08)
        paste(a,r,rnd.randint(6,20),rnd.randint(7,19))
    light(a,27,1,'g')
    return outline(a)
def smelter(status='g',fill=1.0):
    a=new(32,32); block(a,1,3,30,28)
    for (x,y) in [(4,0),(24,0)]: rect(a,x,y,4,5,hx(METAL[1])); rect(a,x+1,y,2,1,hx('#07050d'))
    shaded_disc(a,15.5,17,9,['#1f1812','#3d2f22','#6b5440'],dither=0.1)
    shaded_disc(a,15.5,17,6.5,['#2a1210','#1f1812'],dither=0)
    glow=['#8f2a10','#ff7a2e','#ffcc33','#fff2c0'] if fill>0.6 else ['#5a1a08','#8f2a10','#ff7a2e','#ffb02e']
    shaded_disc(a,15.5,17,5.5*max(0.55,fill),glow,light=(-0.3,-0.3,0.9),dither=0.35)
    for x in range(5,27,3): put(a,x,29,hx(METAL[1]))
    light(a,27,5,status)
    return outline(a)
def assembler(stalled=True):
    a=new(48,32); block(a,1,1,46,30)
    rect(a,6,8,36,16,hx('#1a130e')); rect(a,6,8,36,1,hx('#07050d'))
    # half-built hull frame on the bench
    fr=hx('#9e978a'); frl=hx('#cfc8b6')
    for x in range(10,34): put(a,x,12,frl); put(a,x,19,fr)
    for x in (10,16,22,28,33): rect(a,x,12,1,8,fr)
    for x in range(26,34): put(a,x,12,hx('#3d2f22')); put(a,x,19,hx('#3d2f22'))
    # robot arm
    rect(a,38,3,6,6,hx(METAL[1])); shaded_disc(a,40.5,5.5,2.4,METAL[1:],dither=0)
    for i in range(10): put(a,38-i,7+i//2,hx('#ffcc33')); put(a,38-i,8+i//2,hx('#b8860b'))
    rect(a,26,11,4,3,hx(METAL[3])); put(a,25,13,hx('#5fd3f5'))
    hazard_edge(a,2,28,44)
    light(a,3,3,'r' if stalled else 'g'); light(a,7,3,'r' if stalled else 'g')
    return outline(a)
def crate(full=True):
    a=new(16,16); block(a,1,1,14,14,['#2a1a10','#5a3a20','#8f5a2a','#c8823a','#f2b06b'])
    rect(a,3,3,10,10,hx('#5a3a20')); 
    for i in range(10): put(a,3+i,3+i,hx('#c8823a')); put(a,12-i,3+i,hx('#8f5a2a'))
    return outline(a)

# ---------- UI bits ----------
def frame9(fill,hi,mid,lo,edge=K,rivet='#a08868'):
    a=new(12,12); rect(a,0,0,12,12,edge)
    rect(a,1,1,10,10,hx(mid)); rect(a,1,1,10,1,hx(hi)); rect(a,1,1,1,10,hx(hi))
    rect(a,1,10,10,1,hx(lo)); rect(a,10,1,1,10,hx(lo))
    rect(a,3,3,6,6,hx(fill)); rect(a,3,3,6,1,hx(lo)); rect(a,3,3,1,6,hx(lo))
    for (x,y) in [(2,2),(9,2),(2,9),(9,9)]: put(a,x,y,hx(rivet))
    # keep 3px corners; center region 3..8 fill
    return a
def btn9(top,mid,bot,hi):
    a=new(12,12); rect(a,0,0,12,12,K)
    rect(a,1,1,10,10,hx(mid)); rect(a,1,1,10,1,hx(hi)); rect(a,1,1,1,9,hx(hi))
    rect(a,1,9,10,2,hx(bot)); rect(a,10,1,1,10,hx(bot))
    return a
def coin():
    a=new(12,12); shaded_disc(a,5.5,5.5,5,['#8a5a10','#c88a1a','#ffcc33','#fff2a0'],dither=0.15)
    rect(a,5,3,2,6,hx('#8a5a10')); put(a,5,3,hx('#fff2a0'))
    return outline(pad(a))
def icon(name):
    m={
'map':["....kkkk....","..kkbbbbkk..",".kbbBBbbbbk.",".kbBBbbggbk.","kkkkkkkkkkkk","kyyyyyyyyyyk","kkkkkkkkkkkk",".kbbbbbggbk.",".kbbbbbbbbk.","..kkbbbbkk..","....kkkk....","............"],
'factory':["............",".......kkk..",".......kmk..","k..k...kmk..","kk.kk..kmk..","kmkkmkkkmk..","kmmkmmkkmk..","kmmmmmmmmk..","kmymymymmk..","kmmmmmmmmk..","kkkkkkkkkk..","............"],
'market':["............","..kkkkkkk...",".kyyyyyyyk..","kyyYYYYyyyk.","kyyyyyyyyyk.",".kkkkkkkkk..","kyyyyyyyyyk.","kyyYYYYyyyk.",".kkkkkkkkk..","kyyyyyyyyyk.",".kkkkkkkkk..","............"],
'fleet':["......k.....",".....kgk....",".....kmk....","....kmmmk...","..kkkmmmkkk.",".kcckmmmkcck",".kcckmmmkcck",".kkkkmmmkkkk","...kymmmyk..","....kffk....",".....kk.....","............"],
}[name]
    return from_map(m,{'k':'#07050d','b':'#3593bf','B':'#6fd0ee','g':'#6fe08a','y':'#ffcc33','Y':'#fff2a0','m':'#cfc8b6','c':'#d77a45','f':'#ff7a2e'})
def warn():
    m=["....kk....","...kyyk...","...kyyk...","..kyKKyk..","..kyKKyk..",".kyyKKyyk.",".kyyKKyyk.","kyyyyyyyyk","kyyyKKyyyk","kkkkkkkkkk"]
    return from_map(m,{'k':'#07050d','y':'#ff7a2e','K':'#07050d'})

# ---------- background ----------
def vnoise(w,h,scale,seed):
    rng=np.random.default_rng(seed); gw,gh=int(w/scale)+3,int(h/scale)+3; g=rng.random((gh,gw))
    ys,xs=np.mgrid[0:h,0:w]/scale; x0=xs.astype(int); y0=ys.astype(int); fx=xs-x0; fy=ys-y0
    fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy)
    a=g[y0,x0]*(1-fx)+g[y0,x0+1]*fx; b=g[y0+1,x0]*(1-fx)+g[y0+1,x0+1]*fx
    return a*(1-fy)+b*fy
def fbm(w,h,seed):
    return sum(vnoise(w,h,64/(2**i),seed+i)*(0.5**i) for i in range(4))/1.875
def space_bg(w,h,seed=3):
    base=[hx('#07060f'),hx('#0d0b1e'),hx('#16112e'),hx('#24184a'),hx('#3a2266')]
    teal=[hx('#0d0b1e'),hx('#0f2236'),hx('#14384a')]
    n=fbm(w,h,seed); m=fbm(w,h,seed+20)
    a=new(w,h); by=np.tile(BAYER,(h//4+1,w//4+1))[:h,:w]
    v=np.clip((n-0.35)*2.2+(by-0.5)*0.35,0,0.999); idx=(v*5).astype(int)
    t=np.clip((m-0.5)*3+(by-0.5)*0.4,0,0.999); tid=(t*3).astype(int)
    for y in range(h):
        for x in range(w):
            a[y,x]=base[idx[y,x]] if (idx[y,x]>=1 or tid[y,x]==0) else teal[tid[y,x]]
    rnd=random.Random(seed)
    for i in range(int(w*h/180)):
        x,y=rnd.randrange(w),rnd.randrange(h); put(a,x,y,hx(rnd.choice(['#5a5070','#8a80a0','#c8c0e0'])))
    for i in range(int(w*h/4000)):
        x,y=rnd.randrange(w),rnd.randrange(h); c=hx('#ffffff'); d=hx('#8a80c0')
        put(a,x,y,c); put(a,x+1,y,d); put(a,x-1,y,d); put(a,x,y+1,d); put(a,x,y-1,d)
    return a

def line_dots(a,x0,y0,x1,y1,c,step=3,on=2):
    n=int(max(abs(x1-x0),abs(y1-y0)))
    for i in range(n+1):
        if i%step<on:
            x=round(x0+(x1-x0)*i/n); y=round(y0+(y1-y0)*i/n); put(a,x,y,c)
def ring_dots(a,cx,cy,r,c,step=6):
    n=int(2*math.pi*r)
    for i in range(0,n,step):
        t=i/r; put(a,round(cx+r*math.cos(t)),round(cy+r*math.sin(t)),c)
def brackets(a,x,y,w,h,c,l=5):
    for i in range(l):
        for (px,py) in [(x+i,y),(x,y+i),(x+w-1-i,y),(x+w-1,y+i),(x+i,y+h-1),(x,y+h-1-i),(x+w-1-i,y+h-1),(x+w-1,y+h-1-i)]:
            put(a,px,py,c)
