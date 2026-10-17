/* Global Tech Marketing — interactions */
(document.getElementById('projectForm')||document.createElement('form')).addEventListener('submit', function(e){
  e.preventDefault();
  if(!this.checkValidity()){this.reportValidity();return;}
  const data=new FormData(this);
  const subject=encodeURIComponent('New Branding / Landmark Project Enquiry — Global Tech Marketing');
  const body=encodeURIComponent(
    'Name: '+(data.get('name')||'')+'\n'+
    'Company / Organization: '+(data.get('company')||'')+'\n'+
    'Email: '+(data.get('email')||'')+'\n'+
    'Phone: '+(data.get('phone')||'')+'\n'+
    'Project Type: '+(data.get('project')||'')+'\n'+
    'Project Location: '+(data.get('location')||'')+'\n\n'+
    'Project Details:\n'+(data.get('message')||'')
  );
  document.getElementById('successMessage').style.display='block';
  window.location.href='mailto:globaltechmarketing.co@gmail.com?subject='+subject+'&body='+body;
});

/* ===== v2 interactions ===== */
(function(){
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const nav=$('.nav'), links=$('#navLinks'), menu=$('.menu'), top=$('.top');
  menu.addEventListener('click',()=>{const o=links.classList.toggle('open');menu.setAttribute('aria-expanded',o);menu.textContent=o?'✕':'☰'});
  $$('a',links).forEach(a=>a.addEventListener('click',()=>{links.classList.remove('open');menu.setAttribute('aria-expanded',false);menu.textContent='☰'}));
  addEventListener('scroll',()=>{nav.classList.toggle('scrolled',scrollY>20);top.classList.toggle('show',scrollY>700)},{passive:true});
  top.addEventListener('click',()=>scrollTo({top:0}));
  const map={};$$('a',links).forEach(a=>map[a.getAttribute('href').slice(1)]=a);
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){$$('a',links).forEach(a=>a.classList.remove('active'));(map[e.target.id]||{classList:{add(){}}}).classList.add('active')}}),{rootMargin:'-45% 0px -50% 0px'});
  Object.keys(map).forEach(id=>{const el=document.getElementById(id);if(el)io.observe(el)});
  const lb=$('#lightbox'),lbImg=$('img',lb);
  $$('.work img,.brand-panel img').forEach(i=>i.addEventListener('click',()=>{lbImg.src=i.src;lbImg.alt=i.alt;lb.showModal()}));
  lb.addEventListener('click',e=>{if(e.target!==lbImg)lb.close()});
  const y=$('#year');if(y)y.textContent=new Date().getFullYear();
})();
