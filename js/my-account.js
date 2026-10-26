document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);
 const status=await AuthManager.requireCandidateGuard();if(!status?.ok)return;
 const {user,profile}=status;const msg=$('profile-message');
 const say=(text,isError=false)=>{msg.textContent=text;msg.classList.toggle('is-error',isError);msg.classList.toggle('is-success',!isError)};
 $('profile-name').value=profile.full_name||'';$('profile-phone').value=profile.phone||'';
 $('profile-email').value=user.email||profile.email||'';$('profile-status').value=profile.phone_verified?'Verified':'Verification required';
 $('account-logout-btn')?.addEventListener('click',async e=>{e.preventDefault();if(!window.confirm('Are you sure you want to log out?'))return;try{await AuthManager.logout()}catch(err){console.error(err);say('Logout failed. Please try again.',true)}});
 $('cancel-password-btn')?.addEventListener('click',()=>{ $('password-form').reset(); say('Password change cancelled.'); });
 $('profile-form').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('[type="submit"]');
  const name=$('profile-name').value.trim(),email=$('profile-email').value.trim().toLowerCase();
  if(!name||!email){say('Please enter your name and email.',true);return}
  btn.disabled=true;say('Saving profile…');
  try{await AuthManager.updateName(name);if(email!==String(user.email||'').trim().toLowerCase()){await AuthManager.changeEmail(email);say('Name saved. Check your email for the confirmation link.')}else say('Profile updated successfully.')}
  catch(err){console.error(err);say(err.message||'Profile update failed.',true)}finally{btn.disabled=false}
 });
 $('password-form').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('[type="submit"]'),password=$('new-password').value;
  if(!password){say('Please enter a new password.',true);return}
  btn.disabled=true;say('Changing password…');
  try{await AuthManager.changePassword(password);e.currentTarget.reset();say('Password changed successfully.')}
  catch(err){console.error(err);say(err.message||'Password change failed.',true)}finally{btn.disabled=false}
 });
});