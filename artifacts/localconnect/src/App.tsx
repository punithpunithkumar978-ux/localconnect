import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import {
  ArrowLeft, Bell, BriefcaseBusiness, Check, CheckCheck, ChevronDown, CircleHelp,
  Eye, Heart, MapPin, MessageSquare, Plus, Search,
  Send, SlidersHorizontal, Star, Users, X, BadgeCheck, LocateFixed, LayoutDashboard, Compass,
  Building2, CalendarDays, Instagram, Globe2, Pencil, Trash2, ExternalLink
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import 'leaflet/dist/leaflet.css';
import './localconnect.css';

type Creator = {
  id: string; name: string; category: string; city: string; area: string; distanceKm: number; latitude: number; longitude: number;
  followers: number; engagementRate: number; rating: number; verified: boolean; languages: string[];
  startingPriceINR: number; bio: string; niches: string[]; services: {name:string;price:number}[];
  socialProfiles: {name:string;handle:string;followers:number}[]; audience: string;
  portfolio: string[]; reviews: {name:string;text:string;rating:number}[]; availability: string; avatar: string;
};
type LocationPoint = { latitude:number; longitude:number; label:string; source:'search'|'device' };
type GeocoderResult = { lat:string; lon:string; display_name:string };
type Campaign = { id:string; title:string; status:'Planning'|'Active'|'Completed'|'Paused'; budgetINR:number; creatorCount:number; creators:string[]; dueDate:string; };
type Business = { name:string; category:string; location:string; description:string };
type Message = { from:'business'|'creator'; text:string; time:string };
type Thread = { id:string; creatorId:string; messages:Message[] };
type Notification = { id:string; title:string; body:string; time:string; read:boolean; creatorId?:string };
type Store = { saved:string[]; campaigns:Campaign[]; business:Business; profile:{name:string;email:string;phone:string;role:string}; threads:Thread[]; notifications:Notification[]; };

const DEFAULT_MAP_CENTER:[number,number]=[13.6288,79.4192];
const OSM_TILE_URL=import.meta.env.VITE_OSM_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_SEARCH_URL=import.meta.env.VITE_OSM_SEARCH_URL||'https://nominatim.openstreetmap.org/search';
const locationSearchCache=new Map<string,Omit<LocationPoint,'source'>>();
function distanceBetweenKm(fromLat:number,fromLon:number,toLat:number,toLon:number) {
  const radians=(degrees:number)=>degrees*Math.PI/180;
  const dLat=radians(toLat-fromLat);const dLon=radians(toLon-fromLon);
  const a=Math.sin(dLat/2)**2+Math.cos(radians(fromLat))*Math.cos(radians(toLat))*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

const creators: Creator[] = [
  {id:'ananya-rao',name:'Ananya Rao',category:'Food & lifestyle',city:'Tirupati',area:'Tata Nagar',distanceKm:2.4,latitude:13.6376,longitude:79.4165,followers:28400,engagementRate:6.8,rating:4.9,verified:true,languages:['Telugu','English'],startingPriceINR:3500,bio:'Food storyteller helping local places turn a great meal into a reason to visit. I make thoughtful short-form videos and photo stories for independent hospitality brands.',niches:['Restaurants','Cafés','Local travel'],services:[{name:'Instagram Reel',price:3500},{name:'Photo set (8 images)',price:2500},{name:'Reel + story bundle',price:5200}],socialProfiles:[{name:'Instagram',handle:'@ananyaeats',followers:28400},{name:'YouTube',handle:'Ananya Eats Local',followers:8100}],audience:'78% women · 18–34 · Tirupati, Chittoor & Renigunta',portfolio:['Café launch reel','Weekend brunch guide','Tirupati street food'],reviews:[{name:'Madhav, Bean & Leaf',text:'Clear communication and a very natural way of featuring our menu.',rating:5}],availability:'Available this month',avatar:'AR'},
  {id:'rahul-kumar',name:'Rahul Kumar',category:'Video creator',city:'Tirupati',area:'Korlagunta',distanceKm:4.2,latitude:13.6318,longitude:79.4272,followers:25100,engagementRate:6.2,rating:4.8,verified:true,languages:['Telugu','English'],startingPriceINR:2500,bio:'Local videographer and creator focused on honest food, retail and neighbourhood stories. From scripting to delivery, I keep shoots straightforward.',niches:['Food','Retail','Lifestyle'],services:[{name:'Short video',price:2500},{name:'Product photography',price:1800},{name:'Monthly content package',price:8500}],socialProfiles:[{name:'Instagram',handle:'@rahulframes',followers:25100},{name:'YouTube',handle:'Rahul Local',followers:6200}],audience:'64% men · 20–35 · Tirupati & nearby towns',portfolio:['A day at the market','New menu tasting','Local makers'],reviews:[{name:'Sowmya, The Millet House',text:'Delivered on time and understood our brief without overcomplicating it.',rating:5}],availability:'Available this week',avatar:'RK'},
  {id:'kavya-reddy',name:'Kavya Reddy',category:'Fashion & beauty',city:'Tirupati',area:'M.R. Palli',distanceKm:5.6,latitude:13.6225,longitude:79.4052,followers:42600,engagementRate:5.9,rating:4.9,verified:true,languages:['Telugu','English','Hindi'],startingPriceINR:4500,bio:'Beauty and personal style creator. I work with local boutiques and service businesses to create useful, approachable content.',niches:['Beauty','Boutiques','Wellness'],services:[{name:'Try-on Reel',price:4500},{name:'Store visit + stories',price:3000},{name:'Campaign package',price:9800}],socialProfiles:[{name:'Instagram',handle:'@kavyareddy.style',followers:42600}],audience:'82% women · 18–30 · Tirupati, Chittoor & Nellore',portfolio:['Festive edit','Skin routine notes','Boutique walkthrough'],reviews:[{name:'Lalitha, Varnam Boutique',text:'Our customers recognised the pieces from her video and came in asking for them.',rating:5}],availability:'Available next week',avatar:'KR'},
  {id:'sai-teja',name:'Sai Teja',category:'Photography',city:'Tirupati',area:'Renigunta Road',distanceKm:7.1,latitude:13.6461,longitude:79.4353,followers:18300,engagementRate:7.1,rating:4.7,verified:true,languages:['Telugu','English'],startingPriceINR:3000,bio:'Photographer and short-form creator making clean, people-first visuals for local brands and events.',niches:['Photography','Food','Events'],services:[{name:'Brand photo session',price:3000},{name:'Event coverage',price:6500},{name:'Reel + image bundle',price:4900}],socialProfiles:[{name:'Instagram',handle:'@saiteja.visuals',followers:18300}],audience:'59% women · 21–38 · Tirupati & Renigunta',portfolio:['Sunday market portraits','Restaurant interiors','Festive family moments'],reviews:[{name:'Suresh, Palm Grove',text:'The photos feel warm and real. We use them across our pages now.',rating:5}],availability:'Available this month',avatar:'ST'},
  {id:'meghana-naidu',name:'Meghana Naidu',category:'Food creator',city:'Tirupati',area:'Bhavani Nagar',distanceKm:8.8,latitude:13.6154,longitude:79.4231,followers:36700,engagementRate:5.4,rating:4.8,verified:false,languages:['Telugu'],startingPriceINR:4000,bio:'Telugu-first food creator sharing places, family favourites and new menus across the city.',niches:['Food','Family','Local experiences'],services:[{name:'Telugu food Reel',price:4000},{name:'Restaurant feature',price:3500},{name:'Story set',price:1500}],socialProfiles:[{name:'Instagram',handle:'@meghana.tastes',followers:36700}],audience:'73% women · 24–40 · Tirupati & Chittoor',portfolio:['Family lunch spots','Breakfast trail','New bakery visit'],reviews:[{name:'Pranavi, Dosa Corner',text:'Warm, genuine coverage with a strong local audience.',rating:5}],availability:'Available this week',avatar:'MN'},
  {id:'arjun-varma',name:'Arjun Varma',category:'Travel & lifestyle',city:'Chandragiri',area:'Chandragiri Fort Road',distanceKm:11.3,latitude:13.5838,longitude:79.3176,followers:19800,engagementRate:6.4,rating:4.6,verified:true,languages:['Telugu','English'],startingPriceINR:2800,bio:'Neighbourhood and travel storyteller covering the quieter corners around Tirupati and beyond.',niches:['Travel','Outdoors','Local business'],services:[{name:'Location feature',price:2800},{name:'Travel Reel',price:3800},{name:'Photo + video set',price:6200}],socialProfiles:[{name:'Instagram',handle:'@arjun.ontheroad',followers:19800},{name:'YouTube',handle:'Arjun Wanders',followers:4300}],audience:'68% men · 18–34 · Andhra Pradesh & Telangana',portfolio:['A morning in Chandragiri','Roadside tea stops','Temple town walk'],reviews:[{name:'Naveen, Hillside Stay',text:'Thoughtful storytelling that brought us enquiries from nearby families.',rating:5}],availability:'Available this month',avatar:'AV'}
];

const seed:Store = {
  saved:['ananya-rao','rahul-kumar'],
  campaigns:[
    {id:'cmp-101',title:'New menu, new season',status:'Active',budgetINR:18500,creatorCount:3,creators:['ananya-rao','rahul-kumar','meghana-naidu'],dueDate:'2025-10-18'},
    {id:'cmp-102',title:'Weekend brunch launch',status:'Planning',budgetINR:12000,creatorCount:2,creators:['ananya-rao','sai-teja'],dueDate:'2025-11-02'},
    {id:'cmp-103',title:'Monsoon menu stories',status:'Completed',budgetINR:9200,creatorCount:2,creators:['rahul-kumar','meghana-naidu'],dueDate:'2025-08-24'}
  ],
  business:{name:'Bean & Leaf Café',category:'Café & restaurant',location:'Tata Nagar, Tirupati',description:'Neighbourhood café serving locally sourced coffee, seasonal plates and a quiet place to take a pause.'},
  profile:{name:'Punith Kumar',email:'punith@beanandleaf.in',phone:'+91 98765 43210',role:'Owner'},
  threads:[
    {id:'thread-ananya',creatorId:'ananya-rao',messages:[{from:'creator',text:'Hi Punith, I saw the upcoming menu brief. I have a couple of ideas for a relaxed launch reel.',time:'10:24 AM'},{from:'business',text:'That sounds good, Ananya. We would love to show the new seasonal plates and the space.',time:'10:31 AM'}]},
    {id:'thread-rahul',creatorId:'rahul-kumar',messages:[{from:'creator',text:'Thanks for reaching out. I am available Thursday afternoon for a short shoot.',time:'Yesterday'}]}
  ],
  notifications:[
    {id:'note-1',title:'Ananya Rao replied',body:'Ananya shared a few ideas for your menu launch.',time:'10 min ago',read:false,creatorId:'ananya-rao'},
    {id:'note-2',title:'Campaign is underway',body:'New menu, new season has 3 creators attached.',time:'Yesterday',read:false},
    {id:'note-3',title:'Profile viewed',body:'Your business profile was viewed by a local creator.',time:'2 days ago',read:true}
  ]
};
const STORE_KEY='localconnect-demo-v1';
function storeKey(userId:string){return `${STORE_KEY}:${userId||'guest'}`;}
function readStore(userId='guest'):Store {
  try {
    const raw=localStorage.getItem(storeKey(userId));
    if(!raw) return seed;
    const parsed=JSON.parse(raw) as Partial<Store>;
    return { ...seed, ...parsed, business:{...seed.business,...parsed.business}, profile:{...seed.profile,...parsed.profile},
      saved:Array.isArray(parsed.saved)?parsed.saved:seed.saved, campaigns:Array.isArray(parsed.campaigns)?parsed.campaigns:seed.campaigns,
      threads:Array.isArray(parsed.threads)?parsed.threads:seed.threads, notifications:Array.isArray(parsed.notifications)?parsed.notifications:seed.notifications };
  } catch { return seed; }
}
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
const compact=(n:number)=>n>=1000?`${(n/1000).toFixed(n%1000===0?0:1)}K`:String(n);
const person=(id:string)=>creators.find(c=>c.id===id);

function Button({children,onClick,kind='',testid,type='button',disabled=false}: {children:ReactNode;onClick?:()=>void;kind?:string;testid:string;type?:'button'|'submit';disabled?:boolean}) {
  return <button type={type} disabled={disabled} onClick={onClick} data-testid={testid} className={`lc-btn ${kind}`}>{children}</button>;
}
function Avatar({initials,large=false}:{initials:string;large?:boolean}) { return <div className={`lc-person-avatar ${large?'large':''}`} data-testid={`avatar-${initials.toLowerCase()}`}>{initials}</div>; }
function Heading({eyebrow,title,subtitle,action}:{eyebrow?:string;title:string;subtitle?:string;action?:ReactNode}) {
  return <div className="lc-pagehead"><div>{eyebrow&&<div className="lc-eyebrow">{eyebrow}</div>}<h1 className="lc-title" data-testid="text-page-title">{title}</h1>{subtitle&&<p className="lc-subtitle">{subtitle}</p>}</div>{action}</div>;
}

const queryClient=new QueryClient();
const basePath=import.meta.env.BASE_URL.replace(/\/$/,'');
const clerkPubKey=publishableKeyFromHost(window.location.hostname,import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl=import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path:string){return basePath&&path.startsWith(basePath)?path.slice(basePath.length)||'/':path;}

const clerkAppearance={
  theme:shadcn,cssLayerName:'clerk',
  options:{logoPlacement:'inside' as const,logoLinkUrl:basePath||'/',logoImageUrl:`${window.location.origin}${basePath}/logo.svg`},
  variables:{colorPrimary:'#246e60',colorForeground:'#26343b',colorMutedForeground:'#77828a',colorDanger:'#a34439',colorBackground:'#ffffff',colorInput:'#ffffff',colorInputForeground:'#344148',colorNeutral:'#d9e0dd',fontFamily:'DM Sans, sans-serif',borderRadius:'0.4rem'},
  elements:{
    rootBox:'w-full flex justify-center',cardBox:'bg-white rounded-lg w-[440px] max-w-full overflow-hidden border border-[#e0e5e3]',
    card:'!shadow-none !border-0 !bg-transparent !rounded-none',footer:'!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle:{color:'#26343b',fontWeight:700},headerSubtitle:{color:'#77828a'},
    socialButtonsBlockButtonText:{color:'#344148',fontWeight:600},formFieldLabel:{color:'#4d5b62',fontWeight:600},
    footerActionLink:{color:'#246e60',fontWeight:600},footerActionText:{color:'#77828a'},
    dividerText:{color:'#77828a'},identityPreviewEditButton:{color:'#246e60'},formFieldSuccessText:{color:'#286b5e'},
    alertText:{color:'#8f3e35'},logoBox:'mb-2',logoImage:'max-h-9',socialButtonsBlockButton:'border border-[#d9e0dd] rounded-md',
    formButtonPrimary:'rounded-md font-semibold',formFieldInput:'rounded-md border-[#d9e0dd]',footerAction:'border-t border-[#edf0ef]',
    dividerLine:'bg-[#e4e9e6]',alert:'rounded-md',otpCodeFieldInput:'rounded-md',formFieldRow:'gap-2',main:'gap-4'
  }
};
function SignInPage(){return <div className="lc-auth-page"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/></div>;}
function SignUpPage(){return <div className="lc-auth-page"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/></div>;}
function SignOutControl(){
  const {signOut}=useClerk();
  return <><Show when="signed-out"><div className="lc-auth-links"><Link href="/sign-in" className="lc-btn small" data-testid="nav-sign-in">Sign in</Link><Link href="/sign-up" className="lc-btn primary small" data-testid="nav-sign-up">Sign up</Link></div></Show><Show when="signed-in"><button type="button" className="lc-btn ghost small lc-signout" onClick={()=>signOut({redirectUrl:basePath||'/'})} data-testid="button-sign-out">Sign out</button></Show></>;
}
function ClerkCacheInvalidator(){
  const {addListener}=useClerk();const previousUser=useRef<string|null|undefined>(undefined);
  useEffect(()=>addListener(({user})=>{const id=user?.id??null;if(previousUser.current!==undefined&&previousUser.current!==id)queryClient.clear();previousUser.current=id;}),[addListener]);
  return null;
}
function HomeRoute({store}:{store:Store}){
  const {user,isLoaded}=useUser();
  if(!isLoaded)return <div className="lc-home-loading" aria-label="Loading workspace"><div/><div/><div/></div>;
  return user?<Redirect to="/dashboard"/>:<PublicHome store={store}/>;
}
function PublicHome({store}:{store:Store}){
  const [,setLocation]=useLocation();const [place,setPlace]=useState(store.business.location);
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const value=place.trim();if(value)setLocation(`/discover?location=${encodeURIComponent(value)}`);}
  return <div className="lc-public-home">
    <header className="lc-public-header"><Link href="/" className="lc-brand" data-testid="public-link-home"><img className="lc-brand-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt=""/>LocalConnect</Link><nav aria-label="Account navigation" className="lc-public-actions"><Link href="/sign-in" className="lc-btn" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="lc-btn primary" data-testid="link-sign-up">Create account</Link></nav></header>
    <main className="lc-public-main"><div className="lc-public-copy"><div className="lc-eyebrow">A local creator marketplace</div><h1 className="lc-public-title">Good work starts <span>close to home.</span></h1><p className="lc-subtitle">Find trusted creators in your area, compare their work and start a conversation for your next campaign.</p>
       <form className="lc-location-search" onSubmit={submit}><label htmlFor="homepage-location" className="lc-label">Business location</label><div className="lc-location-form-row"><div className="lc-search"><MapPin size={16}/><input id="homepage-location" className="lc-input" value={place} onChange={e=>setPlace(e.target.value)} placeholder="City or neighbourhood" required maxLength={100} data-testid="input-home-location"/></div><Button kind="primary" type="submit" testid="button-home-search"><Search size={15}/>Find creators</Button></div><p className="lc-location-hint">Try Tirupati, Tata Nagar or another city / neighbourhood.</p></form>
      <p className="lc-demo-note"><span className="lc-demo-dot"/>Demo marketplace · sample profiles and localStorage changes stay in this browser.</p>
    </div><aside className="lc-public-aside"><div className="lc-public-aside-head"><MapPin size={17}/><span>Local to your next idea</span></div><div className="lc-public-areas"><div><strong>01</strong><span>Search by city or area</span></div><div><strong>02</strong><span>Compare local talent</span></div><div><strong>03</strong><span>Contact creators directly</span></div></div><div className="lc-public-foot">Currently showing sample creators around Tirupati.</div></aside></main>
  </div>;
}
function LocalConnectApp(){
  const {user,isLoaded}=useUser();
  const userId=user?.id||'guest';
  const [store,setStore]=useState<Store>(()=>readStore(userId));
  const [storeScope,setStoreScope]=useState(userId);
  const [location,setLocation]=useLocation();
  const [noticeOpen,setNoticeOpen]=useState(false);
  useEffect(()=>{if(isLoaded&&storeScope!==userId){setStore(readStore(userId));setStoreScope(userId);}},[isLoaded,userId,storeScope]);
  useEffect(()=>{if(isLoaded&&storeScope===userId){try{localStorage.setItem(storeKey(userId),JSON.stringify(store));}catch{/* storage may be unavailable */}}},[store,isLoaded,storeScope,userId]);
  if(!isLoaded||storeScope!==userId)return <div className="lc-home-loading" aria-label="Loading local demo workspace"><div/><div/><div/></div>;
  if(location==='/'&&!user)return <PublicHome store={store}/>;
  const unread=store.notifications.filter(n=>!n.read).length;
  const toggleSave=(id:string)=>setStore(s=>({...s,saved:s.saved.includes(id)?s.saved.filter(x=>x!==id):[...s.saved,id]}));
  const startMessage=(id:string)=> {
    const threadId=`thread-${id}`;
    setStore(s=>s.threads.some(t=>t.creatorId===id)?s:{...s,threads:[{id:threadId,creatorId:id,messages:[]},...s.threads]});
    setLocation('/messages');
  };
  const markAll=()=>setStore(s=>({...s,notifications:s.notifications.map(n=>({...n,read:true}))}));
  const navItems=[{href:'/dashboard',label:'Overview',icon:LayoutDashboard},{href:'/discover',label:'Discover',icon:Compass},{href:'/campaigns',label:'Campaigns',icon:BriefcaseBusiness},{href:'/businesses',label:'Business',icon:Building2}];
  const active=location==='/creators/new'?'/discover':location;
  return <div className="lc-shell">
    <header className="lc-topbar"><div className="lc-nav-inner">
      <Link href="/" className="lc-brand" data-testid="link-home"><img className="lc-brand-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt=""/> <span>LocalConnect</span></Link>
      <nav className="lc-nav-links" aria-label="Main navigation">{navItems.map(item=><Link key={item.href} href={item.href} className={`lc-nav-link ${active===item.href||(item.href==='/discover'&&location.startsWith('/creators/'))?'active':''}`} data-testid={`nav-${item.label.toLowerCase()}`}>{item.label}</Link>)}</nav>
      <div className="lc-nav-actions">
        <Link href="/messages" className="lc-icon-btn" aria-label="Messages" data-testid="nav-messages"><MessageSquare size={18}/></Link>
        <button className="lc-icon-btn" aria-label="Notifications" onClick={()=>setNoticeOpen(v=>!v)} data-testid="button-notifications"><Bell size={18}/>{unread>0&&<span className="lc-dot"/>}</button>
         <Link href="/profile" className="lc-row" style={{gap:8}} data-testid="nav-profile"><Avatar initials={store.profile.name.split(' ').map(x=>x[0]).join('').slice(0,2)}/><span className="lc-person-name" style={{fontSize:12}}>{store.profile.name.split(' ')[0]}</span></Link>
         <SignOutControl/>
      </div>
    </div></header>
    {noticeOpen&&<div className="lc-notification-menu" role="dialog" aria-label="Notifications"><div className="lc-panel-head" style={{padding:'14px 15px 0'}}><div><div className="lc-section-title">Notifications</div><p className="lc-section-note">{unread} unread</p></div><button className="lc-icon-btn" onClick={()=>setNoticeOpen(false)} aria-label="Close notifications" data-testid="button-close-notifications"><X size={16}/></button></div>
      {store.notifications.map(n=><div className={`lc-notice ${n.read?'':'unread'}`} key={n.id} data-testid={`notification-${n.id}`}><span style={{color:n.read?'#98a29e':'#246e60'}}><Bell size={15}/></span><div><strong>{n.title}</strong><div className="lc-muted">{n.body}</div><small className="lc-muted">{n.time}</small>{n.creatorId&&<div style={{marginTop:8}}><Link href={`/creators/${n.creatorId}`} className="lc-muted" onClick={()=>setNoticeOpen(false)} data-testid={`link-notification-${n.id}`}>View creator</Link></div>}</div></div>)}
      <button className="lc-btn ghost small" style={{margin:10}} onClick={markAll} data-testid="button-mark-notifications-read"><CheckCheck size={14}/>Mark all as read</button>
    </div>}
    <main className="lc-main">
      <Switch>
        <Route path="/" component={()=> <HomeRoute store={store}/>}/>
        <Route path="/dashboard" component={()=> <Dashboard store={store} toggleSave={toggleSave}/>}/>
        <Route path="/discover" component={()=> <Discover store={store} toggleSave={toggleSave} startMessage={startMessage}/>}/>
        <Route path="/creators/:id" component={()=> <CreatorProfile store={store} toggleSave={toggleSave} startMessage={startMessage}/>}/>
        <Route path="/campaigns" component={()=> <Campaigns store={store} setStore={setStore}/>}/>
        <Route path="/businesses" component={()=> <BusinessPage store={store} setStore={setStore}/>}/>
        <Route path="/messages" component={()=> <Messages store={store} setStore={setStore}/>}/>
        <Route path="/profile" component={()=> <AccountPage store={store} setStore={setStore}/>}/>
        <Route component={NotFound}/>
      </Switch>
       <div className="lc-footer-note">LocalConnect · Tirupati demo workspace · Sample records and changes are demo/local-only (saved in this browser)</div>
    </main>
  </div>;
}

function Dashboard({store,toggleSave}:{store:Store;toggleSave:(id:string)=>void}) {
  const [,setLocation]=useLocation();
  const active=store.campaigns.filter(c=>c.status==='Active');
  const completed=store.campaigns.filter(c=>c.status==='Completed').sort((a,b)=>b.dueDate.localeCompare(a.dueDate));
  const spend=active.reduce((a,c)=>a+c.budgetINR,0);
  const recommendations=creators.slice(0,3);
  return <>
    <Heading eyebrow="Business workspace" title={`Good morning, ${store.profile.name.split(' ')[0]}`} subtitle="A clear view of your local creator partnerships." action={<Button kind="primary" testid="button-find-creators" onClick={()=>setLocation('/discover')}><Search size={15}/>Find creators</Button>}/>
    <div className="lc-statrow" data-testid="dashboard-summary">
      <div className="lc-stat"><div className="lc-stat-label">Active campaigns</div><div className="lc-stat-value" data-testid="stat-active-campaigns">{active.length}</div><div className="lc-stat-meta">Across your business</div></div>
      <div className="lc-stat"><div className="lc-stat-label">Campaign budget</div><div className="lc-stat-value">{money(spend)}</div><div className="lc-stat-meta">Budget in active campaigns</div></div>
      <div className="lc-stat"><div className="lc-stat-label">Saved creators</div><div className="lc-stat-value">{store.saved.length}</div><div className="lc-stat-meta">Ready for your next brief</div></div>
    </div>
    <div className="lc-grid two">
      <section className="lc-panel lc-panel-pad"><div className="lc-panel-head"><div><h2 className="lc-section-title">Recommended nearby</h2><p className="lc-section-note">Creators around {store.business.location.split(',')[0]}</p></div><Link className="lc-btn small" href="/discover" data-testid="link-all-creators">Browse all <ExternalLink size={13}/></Link></div>
        <div className="lc-list">{recommendations.map(c=><div className="lc-list-row" key={c.id} data-testid={`recommended-${c.id}`}><div className="lc-person"><Avatar initials={c.avatar}/><div><Link href={`/creators/${c.id}`} className="lc-person-name">{c.name}</Link><div className="lc-person-meta">{c.category} · {c.distanceKm} km</div></div></div><div className="lc-row"><span className="lc-data">{c.engagementRate}%</span><button className="lc-icon-btn" aria-label={store.saved.includes(c.id)?'Unsave creator':'Save creator'} onClick={()=>toggleSave(c.id)} data-testid={`button-save-${c.id}`}><Heart size={16} fill={store.saved.includes(c.id)?'#246e60':'none'} color={store.saved.includes(c.id)?'#246e60':'currentColor'}/></button></div></div>)}</div>
      </section>
      <section className="lc-panel lc-panel-pad"><div className="lc-panel-head"><div><h2 className="lc-section-title">Campaigns in progress</h2><p className="lc-section-note">Keep your local collaborations moving</p></div><Link className="lc-btn small" href="/campaigns" data-testid="link-campaigns">All campaigns</Link></div>
        {active.length?active.map(c=><div className="lc-list-row" key={c.id} data-testid={`active-campaign-${c.id}`}><div><div className="lc-person-name">{c.title}</div><div className="lc-person-meta">{c.creatorCount} creators · {money(c.budgetINR)} · Due {new Date(`${c.dueDate}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</div></div><span className="lc-badge">{c.status}</span></div>):<div className="lc-empty"><strong>No active campaigns</strong>Start a campaign when you are ready to brief creators.</div>}
      </section>
      <section className="lc-panel lc-panel-pad lc-previous-ads" data-testid="previous-ads-section"><div className="lc-panel-head"><div><h2 className="lc-section-title">Previous ads</h2><p className="lc-section-note">Completed creator campaigns and what they included.</p></div><Link className="lc-btn small" href="/campaigns?status=Completed" data-testid="link-previous-ads">View campaign archive <ExternalLink size={13}/></Link></div>
        {completed.length?completed.map(c=><div className="lc-previous-ad" key={c.id} data-testid={`previous-ad-${c.id}`}><div className="lc-previous-ad-main"><strong>{c.title}</strong><span>{c.creators.map(id=>person(id)?.name).filter(Boolean).join(', ')||`${c.creatorCount} creators`}</span></div><div className="lc-previous-ad-meta"><span>{new Date(`${c.dueDate}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span><strong>{money(c.budgetINR)}</strong></div></div>):<div className="lc-empty"><strong>No completed campaigns yet</strong>Completed creator campaigns will appear here.</div>}
      </section>
      <section className="lc-panel lc-panel-pad"><div className="lc-panel-head"><div><h2 className="lc-section-title">Recent messages</h2><p className="lc-section-note">Continue a creator conversation</p></div><Link className="lc-btn small" href="/messages">Open inbox</Link></div>
        {store.threads.slice(0,2).map(t=>{const c=person(t.creatorId);if(!c)return null;const last=t.messages[t.messages.length-1];return <Link key={t.id} href="/messages" className="lc-list-row" data-testid={`dashboard-thread-${t.id}`}><div className="lc-person"><Avatar initials={c.avatar}/><div><div className="lc-person-name">{c.name}</div><div className="lc-person-meta">{last?.text||'Start a conversation'}</div></div></div><span className="lc-muted"><ChevronDown size={15}/></span></Link>})}
      </section>
      <section className="lc-panel lc-panel-pad"><div className="lc-panel-head"><div><h2 className="lc-section-title">Your business profile</h2><p className="lc-section-note">How creators see your business</p></div><Link href="/businesses" className="lc-btn small"><Pencil size={13}/>Edit</Link></div><div className="lc-person-name">{store.business.name}</div><div className="lc-person-meta">{store.business.category} · {store.business.location}</div><p className="lc-data" style={{marginTop:12}}>{store.business.description}</p></section>
    </div>
  </>;
}

function Discover({store,toggleSave,startMessage}:{store:Store;toggleSave:(id:string)=>void;startMessage:(id:string)=>void}) {
  const initialLocation=new URLSearchParams(window.location.search).get('location')||store.business.location;
  const [place,setPlace]=useState(initialLocation);const [query,setQuery]=useState(''); const [category,setCategory]=useState('All categories'); const [radius,setRadius]=useState('25'); const [sort,setSort]=useState('Recommended'); const [view,setView]=useState<'list'|'map'>('list'); const [selected,setSelected]=useState<string|null>(null);
  const [locationPoint,setLocationPoint]=useState<LocationPoint|null>(null);const [locationStatus,setLocationStatus]=useState('');const [locationBusy,setLocationBusy]=useState(false);const lastGeocodeRequest=useRef(0);
  const cats=['All categories',...Array.from(new Set(creators.map(c=>c.category)))];
  const results=useMemo(()=>creators.map(c=>({
    ...c,
    distanceKm:locationPoint?Number(distanceBetweenKm(locationPoint.latitude,locationPoint.longitude,c.latitude,c.longitude).toFixed(1)):c.distanceKm
  })).filter(c=>{
    const q=query.toLowerCase();const loc=c.city+' '+c.area;const locationMatches=locationPoint?c.distanceKm<=Number(radius):place.trim().split(/[,\s]+/).filter(Boolean).every(token=>loc.toLowerCase().includes(token.toLowerCase()));
    return locationMatches&&(!q||`${c.name} ${c.category} ${c.area} ${c.niches.join(' ')}`.toLowerCase().includes(q))&&(category==='All categories'||c.category===category)&&(locationPoint||c.distanceKm<=Number(radius));
  }).sort((a,b)=>sort==='Distance'?a.distanceKm-b.distanceKm:sort==='Followers'?b.followers-a.followers:b.rating-a.rating),[place,query,category,radius,sort]);
  const mapCenter=useMemo<[number,number]>(()=>{
    if(locationPoint)return [locationPoint.latitude,locationPoint.longitude];
    if(results.length)return [results.reduce((sum,c)=>sum+c.latitude,0)/results.length,results.reduce((sum,c)=>sum+c.longitude,0)/results.length];
    return DEFAULT_MAP_CENTER;
  },[locationPoint,results]);
  const submitLocationSearch=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();const searchTerm=place.trim();
    if(!searchTerm){setLocationStatus('Enter a city, neighbourhood, or address to search.');return;}
    setLocationBusy(true);setLocationStatus('Searching OpenStreetMap…');
    try {
      const cacheKey=searchTerm.toLowerCase();
      let match=locationSearchCache.get(cacheKey);
      if(!match){
        const delay=Math.max(0,1100-(Date.now()-lastGeocodeRequest.current));
        if(delay)await new Promise(resolve=>window.setTimeout(resolve,delay));
        const url=new URL(OSM_SEARCH_URL);url.searchParams.set('format','jsonv2');url.searchParams.set('limit','1');url.searchParams.set('q',searchTerm);
        lastGeocodeRequest.current=Date.now();
        const response=await fetch(url.toString(),{headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error(response.status===429?'Location search is temporarily rate-limited. Wait a moment and try again.':'OpenStreetMap could not complete the search.');
        const matches=await response.json() as GeocoderResult[];
        if(!matches.length)throw new Error('No matching place was found. Try a nearby city or area name.');
        const latitude=Number(matches[0].lat);const longitude=Number(matches[0].lon);
        if(!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new Error('The selected place did not return valid map coordinates.');
        const label=matches[0].display_name.split(',').slice(0,3).map(part=>part.trim()).join(', ');
        match={latitude,longitude,label};locationSearchCache.set(cacheKey,match);
      }
      const point:LocationPoint={...match,source:'search'};
      setLocationPoint(point);setPlace(point.label);setSelected(null);setLocationStatus(`Map centered on ${point.label}. Creator distances are estimates from sample locations.`);
    } catch(error) {
      setLocationStatus(error instanceof Error?error.message:'Location search failed. Check your connection and try again.');
    } finally {setLocationBusy(false);}
  };
  const useCurrentLocation=()=>{
    if(!navigator.geolocation){setLocationStatus('This browser does not support live location. Search for a city or area instead.');return;}
    setLocationBusy(true);setLocationStatus('Waiting for browser location permission…');
    navigator.geolocation.getCurrentPosition(position=>{
      const point:LocationPoint={latitude:position.coords.latitude,longitude:position.coords.longitude,label:'Your current location',source:'device'};
      setLocationPoint(point);setPlace(point.label);setSelected(null);setLocationStatus('Map centered on your current location. Creator distances are estimates from sample locations.');setLocationBusy(false);
    },error=>{
      const message=error.code===1?'Location permission was denied. Allow it in your browser settings, or search for a place.':error.code===3?'Location request timed out. Try again or search for a place.':'Your location is unavailable. Try again or search for a place.';
      setLocationStatus(message);setLocationBusy(false);
    },{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  };
  const adjustFilters=()=>{setPlace(store.business.location);setLocationPoint(null);setLocationStatus('');setQuery('');setCategory('All categories');setRadius('25');setSelected(null);};
  const mapZoom=locationPoint?.source==='device'?14:13;
  return <>
    <Heading eyebrow="Local creator marketplace" title="Find creators near you" subtitle="Discover trusted local talent for your next collaboration." action={<div className="lc-toolbar"><div className="lc-search"><Search size={16}/><input className="lc-input" aria-label="Search creators" placeholder="Name, niche or neighbourhood" value={query} onChange={e=>setQuery(e.target.value)} data-testid="input-search-creators"/></div></div>}/>
    <div className="lc-panel lc-panel-pad lc-discover-filters" style={{marginBottom:16}}><div className="lc-toolbar">
       <form className="lc-field lc-location-filter" onSubmit={submitLocationSearch}><label htmlFor="discover-location" className="lc-label">Location</label><div className="lc-location-controls"><div className="lc-search"><MapPin size={16}/><input id="discover-location" className="lc-input" aria-label="Filter by city or area" placeholder="City or neighbourhood" value={place} onChange={e=>{setPlace(e.target.value);setLocationPoint(null);setLocationStatus('');}} maxLength={100} data-testid="input-discover-location"/></div><Button kind="small primary" type="submit" testid="button-search-location" disabled={locationBusy}><Search size={14}/>Search</Button><Button kind="small" onClick={useCurrentLocation} testid="button-use-current-location" disabled={locationBusy}><LocateFixed size={14}/>Use my location</Button></div></form>
      <label className="lc-field" style={{minWidth:175}}><span className="lc-label">Category</span><select className="lc-select" value={category} onChange={e=>setCategory(e.target.value)} data-testid="select-category">{cats.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="lc-field" style={{minWidth:150}}><span className="lc-label">Search radius</span><select className="lc-select" value={radius} onChange={e=>setRadius(e.target.value)} data-testid="select-radius"><option value="5">Within 5 km</option><option value="10">Within 10 km</option><option value="15">Within 15 km</option><option value="25">Within 25 km</option></select></label>
      <label className="lc-field" style={{minWidth:150}}><span className="lc-label">Sort by</span><select className="lc-select" value={sort} onChange={e=>setSort(e.target.value)} data-testid="select-sort"><option>Recommended</option><option>Distance</option><option>Followers</option></select></label>
       <div className="lc-discover-view-toggle"><Button kind={`small ${view==='list'?'primary':''}`} testid="button-view-list" onClick={()=>setView('list')}><Users size={14}/>List</Button><Button kind={`small ${view==='map'?'primary':''}`} testid="button-view-map" onClick={()=>setView('map')}><MapPin size={14}/>Map</Button></div>
     </div>{locationStatus&&<p className="lc-location-status" role="status" data-testid="status-location">{locationStatus}</p>}<p className="lc-location-hint">OpenStreetMap receives submitted searches and map-area tile requests. Creator pins and distance estimates use approximate sample data.</p></div>
    <div className={`lc-discover-grid ${view==='map'?'map-first':''}`}>
      {view==='map'&&<MapView results={results} selected={selected} setSelected={setSelected} store={store} toggleSave={toggleSave} startMessage={startMessage} center={mapCenter} zoom={mapZoom} locationPoint={locationPoint}/>}
      <div className="lc-results">
        <div className="lc-panel" data-testid="creator-results"><div className="lc-panel-head" style={{padding:'15px 18px 0'}}><div><h2 className="lc-section-title">{results.length} {results.length===1?'creator':'creators'} in {place||'your selected area'}</h2><p className="lc-section-note">Sample creator profiles · approximate map pins and distances</p></div><span className="lc-muted" style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}><SlidersHorizontal size={13}/>Filters applied</span></div>
        {results.length?results.map(c=><CreatorCard key={c.id} creator={c} saved={store.saved.includes(c.id)} toggleSave={toggleSave} startMessage={startMessage} onSelect={()=>setSelected(c.id)}/>):<div className="lc-empty"><MapPin size={19} style={{margin:'0 auto 10px'}}/><strong>No creators found for {place||'this location'}</strong>Try Tirupati, Tata Nagar, or another area represented in this sample marketplace. You can also increase your radius or change your category.<div style={{marginTop:15}}><Button testid="button-adjust-filters" onClick={adjustFilters}>Reset filters</Button></div></div>}
      </div></div>
        {view==='list'&&<MapView results={results} selected={selected} setSelected={setSelected} store={store} toggleSave={toggleSave} startMessage={startMessage} center={mapCenter} zoom={mapZoom} locationPoint={locationPoint}/>}
    </div>
  </>;
}

function CreatorCard({creator:c,saved,toggleSave,startMessage,onSelect}:{creator:Creator;saved:boolean;toggleSave:(id:string)=>void;startMessage:(id:string)=>void;onSelect?:()=>void}) {
  return <article className="lc-creator-card" data-testid={`creator-card-${c.id}`} onClick={onSelect}>
    <div className="lc-creator-head"><Avatar initials={c.avatar}/><div style={{minWidth:0,flex:1}}><div className="lc-creator-titleline"><Link href={`/creators/${c.id}`} data-testid={`link-creator-${c.id}`}>{c.name}</Link>{c.verified&&<span className="lc-badge"><BadgeCheck size={12}/>Verified</span>}</div><div className="lc-person-meta">{c.category} · {c.city} · {c.area}</div></div>
      <div className="lc-card-actions"><button className="lc-icon-btn" aria-label={saved?'Unsave creator':'Save creator'} onClick={e=>{e.stopPropagation();toggleSave(c.id)}} data-testid={`button-save-${c.id}`}><Heart size={17} fill={saved?'#246e60':'none'} color={saved?'#246e60':'currentColor'}/></button></div></div>
    <div className="lc-data" style={{margin:'13px 0 0'}}>{c.bio}</div>
    <div className="lc-tags">{c.niches.map(n=><span className="lc-tag" key={n}>{n}</span>)}{c.languages.map(l=><span className="lc-tag" key={l}>{l}</span>)}</div>
    <div className="lc-creator-foot"><div className="lc-row" style={{gap:18,flexWrap:'wrap'}}><span className="lc-data" style={{display:'flex',gap:5,alignItems:'center'}}><MapPin size={13}/>≈ {c.distanceKm} km · sample estimate</span><span className="lc-data">{compact(c.followers)} followers</span><span className="lc-data">{c.engagementRate}% engagement</span><span className="lc-data" style={{display:'flex',alignItems:'center',gap:4}}><Star size={13} fill="#9a7940" color="#9a7940"/>{c.rating}</span><strong className="lc-data" style={{color:'#344148'}}>From {money(c.startingPriceINR)}</strong></div><div className="lc-row"><Link className="lc-btn small" href={`/creators/${c.id}`} data-testid={`button-view-profile-${c.id}`}><Eye size={13}/>View profile</Link><Button kind="small primary" testid={`button-contact-${c.id}`} onClick={()=>startMessage(c.id)}><MessageSquare size={13}/>Contact</Button></div></div>
  </article>;
}

function MapRecenter({center,zoom}:{center:[number,number];zoom:number}) {
  const map=useMap();
  useEffect(()=>{map.flyTo(center,zoom,{animate:true,duration:0.65});},[map,center[0],center[1],zoom]);
  return null;
}

function MapView({results,selected,setSelected,store,toggleSave,startMessage,center,zoom,locationPoint}:{results:Creator[];selected:string|null;setSelected:(id:string|null)=>void;store:Store;toggleSave:(id:string)=>void;startMessage:(id:string)=>void;center:[number,number];zoom:number;locationPoint:LocationPoint|null}) {
  const chosen=results.find(c=>c.id===selected)||results[0];
  return <div className="lc-map" data-testid="creator-map">
    <MapContainer center={center} zoom={zoom} scrollWheelZoom zoomControl className="lc-map-canvas">
      <TileLayer url={OSM_TILE_URL} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'/>
      <MapRecenter center={center} zoom={zoom}/>
      {locationPoint&&<CircleMarker center={[locationPoint.latitude,locationPoint.longitude]} radius={9} pathOptions={{color:'#fff',weight:3,fillColor:'#2878d0',fillOpacity:1}} data-testid="marker-current-location"><Popup>{locationPoint.label}</Popup></CircleMarker>}
      {results.map(c=><CircleMarker key={c.id} center={[c.latitude,c.longitude]} radius={chosen?.id===c.id?9:7} pathOptions={{color:'#fff',weight:2,fillColor:chosen?.id===c.id?'#263b39':'#246e60',fillOpacity:1}} eventHandlers={{click:()=>setSelected(c.id)}} data-testid={`marker-${c.id}`}><Popup><strong>{c.name}</strong><br/>{c.area}<br/>≈ {c.distanceKm} km · sample estimate</Popup></CircleMarker>)}
    </MapContainer>
    {chosen&&<div className="lc-map-card" data-testid="map-selected-creator"><div className="lc-row" style={{justifyContent:'space-between'}}><div className="lc-person"><Avatar initials={chosen.avatar}/><div><Link href={`/creators/${chosen.id}`} className="lc-person-name">{chosen.name}</Link><div className="lc-person-meta">{chosen.category} · ≈ {chosen.distanceKm} km</div></div></div><button className="lc-icon-btn" aria-label={store.saved.includes(chosen.id)?'Unsave creator':'Save creator'} onClick={()=>toggleSave(chosen.id)} data-testid={`map-save-${chosen.id}`}><Heart size={16} fill={store.saved.includes(chosen.id)?'#246e60':'none'}/></button></div><div className="lc-row" style={{justifyContent:'space-between',marginTop:10}}><span className="lc-data">From {money(chosen.startingPriceINR)} · {chosen.engagementRate}% engagement</span><Button kind="small primary" testid={`map-contact-${chosen.id}`} onClick={()=>startMessage(chosen.id)}><MessageSquare size={13}/>Contact</Button></div></div>}
  </div>;
}

function CreatorProfile({store,toggleSave,startMessage}:{store:Store;toggleSave:(id:string)=>void;startMessage:(id:string)=>void}) {
  const {id}=useParams<{id:string}>(); const c=creators.find(x=>x.id===id);
  if(!c) return <div className="lc-empty"><strong>Creator not found</strong>This demo profile is no longer available.<Link className="lc-btn" href="/discover">Back to discovery</Link></div>;
  return <>
    <div style={{marginBottom:17}}><Link href="/discover" className="lc-row lc-muted" style={{fontSize:12}} data-testid="link-back-discover"><ArrowLeft size={14}/>Back to creators</Link></div>
    <div className="lc-panel" style={{overflow:'hidden',marginBottom:18}}><div className="lc-profile-cover"/><div className="lc-profile-header"><Avatar initials={c.avatar} large/><div style={{flex:1}}><div className="lc-creator-titleline"><h1 className="lc-title" data-testid={`text-creator-name-${c.id}`} style={{fontSize:24}}>{c.name}</h1>{c.verified&&<span className="lc-badge"><BadgeCheck size={12}/>Verified</span>}</div><div className="lc-person-meta">{c.category} · {c.area}, {c.city}</div></div><div className="lc-row"><Button testid={`button-profile-save-${c.id}`} onClick={()=>toggleSave(c.id)}><Heart size={15} fill={store.saved.includes(c.id)?'#246e60':'none'} color={store.saved.includes(c.id)?'#246e60':'currentColor'}/>{store.saved.includes(c.id)?'Saved':'Save creator'}</Button><Button kind="primary" testid={`button-request-collaboration-${c.id}`} onClick={()=>startMessage(c.id)}><MessageSquare size={15}/>Request collaboration</Button></div></div>
      <div className="lc-statrow" style={{margin:'0 24px 22px'}}><div className="lc-stat"><div className="lc-stat-label">Followers</div><div className="lc-stat-value">{compact(c.followers)}</div></div><div className="lc-stat"><div className="lc-stat-label">Engagement rate</div><div className="lc-stat-value">{c.engagementRate}%</div></div><div className="lc-stat"><div className="lc-stat-label">Creator rating</div><div className="lc-stat-value" style={{display:'flex',alignItems:'center',gap:6}}><Star size={17} fill="#9a7940" color="#9a7940"/>{c.rating}</div></div></div>
    </div>
    <div className="lc-detail-grid"><div className="lc-grid">
      <section className="lc-panel lc-panel-pad"><h2 className="lc-section-title">About</h2><p className="lc-data" style={{fontSize:13,marginTop:10}}>{c.bio}</p><div className="lc-tags">{c.niches.map(n=><span className="lc-tag" key={n}>{n}</span>)}</div></section>
      <section className="lc-panel lc-panel-pad"><h2 className="lc-section-title">Audience</h2><p className="lc-data" style={{marginTop:10}}>{c.audience}</p><p className="lc-person-meta">Languages: {c.languages.join(' · ')}</p></section>
      <section className="lc-panel lc-panel-pad"><h2 className="lc-section-title">Portfolio</h2><div className="lc-grid three" style={{marginTop:14}}>{c.portfolio.map((p,i)=><div key={p} style={{border:'1px solid #e4e9e6',background:i===1?'#f2f5f2':'#f7f8f6',minHeight:92,padding:12,display:'flex',alignItems:'flex-end',fontSize:12,fontWeight:600,color:'#52605f'}}>{p}</div>)}</div></section>
      <section className="lc-panel lc-panel-pad"><h2 className="lc-section-title">Reviews</h2>{c.reviews.map(r=><div key={r.name} className="lc-list-row"><div><div className="lc-person-name">{r.name}</div><div className="lc-person-meta">{r.text}</div></div><span className="lc-data"><Star size={13} fill="#9a7940" color="#9a7940"/> {r.rating}</span></div>)}</section>
    </div><aside className="lc-panel lc-panel-pad lc-side-sticky"><h2 className="lc-section-title">Services & pricing</h2><p className="lc-section-note">Starting at {money(c.startingPriceINR)}</p>{c.services.map(s=><div className="lc-social" key={s.name}><span>{s.name}</span><strong>{money(s.price)}</strong></div>)}<h2 className="lc-section-title" style={{marginTop:23}}>Social profiles</h2>{c.socialProfiles.map(s=><div className="lc-social" key={s.name}><span className="lc-row">{s.name==='Instagram'?<Instagram size={15}/>:<Globe2 size={15}/>} {s.handle}</span><span>{compact(s.followers)}</span></div>)}<div className="lc-social" style={{marginTop:8}}><span className="lc-row"><CalendarDays size={15}/>Availability</span><span style={{color:'#246e60'}}>{c.availability}</span></div><Button kind="primary" testid={`button-sidebar-contact-${c.id}`} onClick={()=>startMessage(c.id)}><MessageSquare size={14}/>Request collaboration</Button></aside></div>
  </>;
}

function Campaigns({store,setStore}:{store:Store;setStore:Dispatch<SetStateAction<Store>>}) {
  const [open,setOpen]=useState(false); const [filter,setFilter]=useState(()=>new URLSearchParams(window.location.search).get('status')==='Completed'?'Completed':'All campaigns'); const [error,setError]=useState('');
  const visible=store.campaigns.filter(c=>filter==='All campaigns'||c.status===filter);
  function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const title=String(f.get('title')||'').trim();const budget=Number(f.get('budget'));const date=String(f.get('dueDate')||'');const ids=f.getAll('creators').map(String);if(!title||budget<1||!date||ids.length===0){setError('Add a title, a valid budget, a due date and at least one creator.');return;}const campaign:Campaign={id:`cmp-${Date.now()}`,title,status:'Planning',budgetINR:budget,creatorCount:ids.length,creators:ids,dueDate:date};setStore(s=>({...s,campaigns:[campaign,...s.campaigns]}));setOpen(false);setError('');}
  const advance=(c:Campaign)=>{const next:Campaign['status']=c.status==='Planning'?'Active':c.status==='Active'?'Completed':c.status==='Paused'?'Active':'Planning';setStore(s=>({...s,campaigns:s.campaigns.map(x=>x.id===c.id?{...x,status:next}:x)}));};
  const remove=(id:string)=>{if(window.confirm('Delete this campaign? This cannot be undone.'))setStore(s=>({...s,campaigns:s.campaigns.filter(c=>c.id!==id)}));};
  return <>
    <Heading eyebrow="Partnerships" title="Campaigns" subtitle="Plan and track your creator collaborations." action={<Button kind="primary" testid="button-create-campaign" onClick={()=>setOpen(true)}><Plus size={15}/>Create campaign</Button>}/>
    <div className="lc-panel lc-panel-pad"><div className="lc-tabs">{['All campaigns','Planning','Active','Completed','Paused'].map(v=><button key={v} className={`lc-tab ${filter===v?'active':''}`} onClick={()=>setFilter(v)} data-testid={`tab-campaign-${v.toLowerCase().replace(' ','-')}`}>{v}</button>)}</div>
      {visible.length?<div className="lc-table-wrap"><table className="lc-table"><thead><tr><th>Campaign</th><th>Status</th><th>Creators</th><th>Budget</th><th>Due date</th><th>Actions</th></tr></thead><tbody>{visible.map(c=><tr key={c.id} data-testid={`campaign-row-${c.id}`}><td><strong style={{color:'#344148'}}>{c.title}</strong></td><td><span className={`lc-badge ${c.status==='Planning'?'amber':c.status==='Completed'?'neutral':''}`}>{c.status}</span></td><td>{c.creators.map(id=>person(id)?.name.split(' ')[0]).filter(Boolean).join(', ')||c.creatorCount+' creators'}</td><td>{money(c.budgetINR)}</td><td>{new Date(`${c.dueDate}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</td><td><div className="lc-row"><Button kind="small" testid={`button-status-${c.id}`} onClick={()=>advance(c)}>{c.status==='Completed'?'Reopen':c.status==='Active'?'Complete':'Start'}</Button><button className="lc-icon-btn" aria-label="Delete campaign" onClick={()=>remove(c.id)} data-testid={`button-delete-campaign-${c.id}`}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>:<div className="lc-empty"><strong>No campaigns here</strong>Create a campaign or choose another status filter.</div>}
    </div>
    {open&&<Modal title="Create campaign" close={()=>setOpen(false)}><form onSubmit={create}><div className="lc-form-grid"><label className="lc-field wide"><span className="lc-label">Campaign name <b>*</b></span><input name="title" required maxLength={80} className="lc-input" placeholder="e.g. New season menu launch" data-testid="input-campaign-title"/></label><label className="lc-field"><span className="lc-label">Budget (INR) <b>*</b></span><input name="budget" type="number" min="1" required className="lc-input" placeholder="12000" data-testid="input-campaign-budget"/></label><label className="lc-field"><span className="lc-label">Due date <b>*</b></span><input name="dueDate" type="date" required min={new Date().toISOString().slice(0,10)} className="lc-input" data-testid="input-campaign-date"/></label><div className="lc-field wide"><span className="lc-label">Select creators <b>*</b></span><div className="lc-grid two">{creators.map(c=><label key={c.id} className="lc-row" style={{fontSize:12,color:'#58656b'}}><input type="checkbox" name="creators" value={c.id} data-testid={`checkbox-campaign-${c.id}`}/>{c.name} <span className="lc-muted">{money(c.startingPriceINR)}+</span></label>)}</div></div></div>{error&&<p role="alert" style={{color:'#a34439',fontSize:12}}>{error}</p>}<div className="lc-row" style={{justifyContent:'flex-end',marginTop:20}}><Button testid="button-cancel-campaign" onClick={()=>setOpen(false)}>Cancel</Button><Button kind="primary" type="submit" testid="button-submit-campaign">Create campaign</Button></div></form></Modal>}
  </>;
}

function Modal({title,children,close}:{title:string;children:ReactNode;close:()=>void}) {
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[close]);
  return <div className="lc-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section className="lc-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="lc-modal-head"><h2 id="modal-title" className="lc-section-title">{title}</h2><button className="lc-icon-btn" aria-label="Close dialog" onClick={close} data-testid="button-close-modal"><X size={17}/></button></div>{children}</section></div>;
}

function BusinessPage({store,setStore}:{store:Store;setStore:Dispatch<SetStateAction<Store>>}) {
  const [saved,setSaved]=useState(false);
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setStore(s=>({...s,business:{name:String(f.get('name')).trim(),category:String(f.get('category')),location:String(f.get('location')).trim(),description:String(f.get('description')).trim()}}));setSaved(true);setTimeout(()=>setSaved(false),2200);}
  return <>
    <Heading eyebrow="Business settings" title="Business profile" subtitle="Keep your local business information accurate for creators."/>
    <div className="lc-detail-grid"><form className="lc-panel lc-panel-pad" onSubmit={submit}><div className="lc-panel-head"><div><h2 className="lc-section-title">Public business details</h2><p className="lc-section-note">Visible to creators when they review a collaboration request.</p></div><Building2 size={18} color="#76847e"/></div><div className="lc-form-grid"><label className="lc-field wide"><span className="lc-label">Business name *</span><input required maxLength={90} name="name" defaultValue={store.business.name} className="lc-input" data-testid="input-business-name"/></label><label className="lc-field"><span className="lc-label">Category *</span><select name="category" className="lc-select" defaultValue={store.business.category} data-testid="select-business-category">{['Café & restaurant','Retail','Beauty & wellness','Hospitality','Professional services','Other'].map(x=><option key={x}>{x}</option>)}</select></label><label className="lc-field"><span className="lc-label">Business location *</span><input required name="location" maxLength={100} defaultValue={store.business.location} className="lc-input" data-testid="input-business-location"/></label><label className="lc-field wide"><span className="lc-label">About your business *</span><textarea required maxLength={400} name="description" defaultValue={store.business.description} className="lc-textarea" data-testid="input-business-description"/></label></div><div className="lc-row" style={{justifyContent:'flex-end',marginTop:18}}>{saved&&<span className="lc-badge"><Check size={13}/>Changes saved</span>}<Button kind="primary" type="submit" testid="button-save-business">Save business profile</Button></div></form>
      <aside className="lc-panel lc-panel-pad"><h2 className="lc-section-title">Profile preview</h2><p className="lc-section-note">A simple view creators will recognise.</p><div style={{border:'1px solid #e4e9e6',borderRadius:5,padding:17,marginTop:17}}><div className="lc-person"><div className="lc-person-avatar" style={{borderRadius:6}}><Building2 size={18}/></div><div><div className="lc-person-name" data-testid="preview-business-name">{store.business.name}</div><div className="lc-person-meta">{store.business.category}</div></div></div><div className="lc-data" style={{marginTop:13,display:'flex',gap:6}}><MapPin size={14}/>{store.business.location}</div><p className="lc-data" style={{marginTop:12}}>{store.business.description}</p></div><div className="lc-data" style={{marginTop:16,display:'flex',gap:7}}><CircleHelp size={15}/>Your exact address is not shown on this demo profile.</div></aside></div>
  </>;
}

function Messages({store,setStore}:{store:Store;setStore:Dispatch<SetStateAction<Store>>}) {
  const [active,setActive]=useState(store.threads[0]?.creatorId||'');const [text,setText]=useState('');
  useEffect(()=>{if(!store.threads.some(t=>t.creatorId===active)&&store.threads[0])setActive(store.threads[0].creatorId);},[store.threads,active]);
  const thread=store.threads.find(t=>t.creatorId===active);const c=person(active);
  function send(e:FormEvent){e.preventDefault();const clean=text.trim();if(!clean||!active)return;setStore(s=>({...s,threads:s.threads.map(t=>t.creatorId===active?{...t,messages:[...t.messages,{from:'business',text:clean,time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}]}:t)}));setText('');}
  return <>
    <Heading eyebrow="Your inbox" title="Messages" subtitle="Coordinate directly with local creators."/>
    <section className="lc-panel lc-convo-layout" data-testid="messages-inbox"><div className="lc-convo-list">{store.threads.length?store.threads.map(t=>{const creator=person(t.creatorId);if(!creator)return null;const last=t.messages[t.messages.length-1];return <button type="button" key={t.id} className={`lc-convo ${active===t.creatorId?'active':''}`} onClick={()=>setActive(t.creatorId)} data-testid={`conversation-${t.creatorId}`}><Avatar initials={creator.avatar}/><div style={{textAlign:'left',minWidth:0}}><div className="lc-person-name">{creator.name}</div><div className="lc-person-meta" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:195}}>{last?.text||'Start the conversation'}</div></div></button>}):<div className="lc-empty"><strong>Your inbox is empty</strong>Contact a creator to start a conversation.</div>}</div>
      {thread&&c?<div className="lc-chat"><div className="lc-chat-head"><div className="lc-person"><Avatar initials={c.avatar}/><div><Link href={`/creators/${c.id}`} className="lc-person-name">{c.name}</Link><div className="lc-person-meta">{c.category} · {c.area}</div></div></div></div><div className="lc-chat-messages" aria-live="polite">{thread.messages.length?thread.messages.map((m,i)=><div key={`${i}-${m.time}`} className={`lc-message ${m.from==='business'?'mine':''}`} data-testid={`message-${thread.id}-${i}`}><div>{m.text}</div><small className="lc-muted" style={{display:'block',marginTop:4}}>{m.from==='business'?'You':c.name} · {m.time}</small></div>):<div className="lc-empty"><strong>Start a conversation with {c.name}</strong>Share your collaboration idea or ask about their availability.</div>}</div><form className="lc-chat-compose" onSubmit={send}><input className="lc-input" aria-label="Message" value={text} onChange={e=>setText(e.target.value)} placeholder={`Message ${c.name}`} maxLength={1000} required data-testid="input-message"/><Button kind="primary" type="submit" testid="button-send-message" disabled={!text.trim()}><Send size={15}/>Send</Button></form></div>:<div className="lc-chat"><div className="lc-empty"><strong>No conversation selected</strong>Choose a creator from the inbox, or discover someone new.<Link href="/discover" className="lc-btn" style={{marginTop:13}}>Find creators</Link></div></div>}
    </section>
  </>;
}

function AccountPage({store,setStore}:{store:Store;setStore:Dispatch<SetStateAction<Store>>}) {
  const [saved,setSaved]=useState(false);
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setStore(s=>({...s,profile:{name:String(f.get('name')).trim(),email:String(f.get('email')).trim(),phone:String(f.get('phone')).trim(),role:String(f.get('role'))}}));setSaved(true);setTimeout(()=>setSaved(false),2200);}
  return <>
    <Heading eyebrow="Personal settings" title="Account profile" subtitle="Manage the details attached to your business workspace."/>
    <div className="lc-detail-grid"><form className="lc-panel lc-panel-pad" onSubmit={submit}><div className="lc-row" style={{marginBottom:22}}><Avatar initials={store.profile.name.split(' ').map(x=>x[0]).join('').slice(0,2)} large/><div><div className="lc-person-name">{store.profile.name}</div><div className="lc-person-meta">{store.profile.role} · {store.business.name}</div></div></div><div className="lc-form-grid"><label className="lc-field wide"><span className="lc-label">Full name *</span><input name="name" required maxLength={80} defaultValue={store.profile.name} className="lc-input" data-testid="input-profile-name"/></label><label className="lc-field wide"><span className="lc-label">Email address *</span><input name="email" type="email" required defaultValue={store.profile.email} className="lc-input" data-testid="input-profile-email"/></label><label className="lc-field"><span className="lc-label">Phone number</span><input name="phone" type="tel" pattern="[+0-9 ()-]{7,20}" defaultValue={store.profile.phone} className="lc-input" data-testid="input-profile-phone"/></label><label className="lc-field"><span className="lc-label">Workspace role</span><select name="role" defaultValue={store.profile.role} className="lc-select" data-testid="select-profile-role">{['Owner','Manager','Marketing lead','Team member'].map(x=><option key={x}>{x}</option>)}</select></label></div><div className="lc-row" style={{justifyContent:'flex-end',marginTop:18}}>{saved&&<span className="lc-badge"><Check size={13}/>Changes saved</span>}<Button kind="primary" type="submit" testid="button-save-profile">Save account details</Button></div></form>
      <aside className="lc-panel lc-panel-pad"><h2 className="lc-section-title">Workspace details</h2><p className="lc-section-note">The active business connected to your account.</p><div className="lc-social"><span>Business</span><strong>{store.business.name}</strong></div><div className="lc-social"><span>Location</span><strong>{store.business.location}</strong></div><div className="lc-social"><span>Account mode</span><span className="lc-badge neutral">Demo workspace</span></div><Link className="lc-btn" href="/businesses" style={{marginTop:17}}><Building2 size={14}/>Manage business</Link></aside></div>
  </>;
}

function Router(){const [location]=useLocation();return <ErrorBoundary resetKey={location}><LocalConnectApp/></ErrorBoundary>}
function ClerkProviderRoutes(){
  const [,setLocation]=useLocation();
  if(!clerkPubKey)throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{signIn:{start:{title:'Welcome back',subtitle:'Sign in to manage your local partnerships'}},signUp:{start:{title:'Create your account',subtitle:'Find trusted creators in your area'}}}}
    routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    <QueryClientProvider client={queryClient}><ClerkCacheInvalidator/><TooltipProvider><Switch>
      <Route path="/sign-in/*?" component={SignInPage}/>
      <Route path="/sign-up/*?" component={SignUpPage}/>
      <Route component={Router}/>
    </Switch><Toaster/></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}
function App(){return <WouterRouter base={basePath}><ClerkProviderRoutes/></WouterRouter>}
export default App;
