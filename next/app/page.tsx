"use client"

import auth0 from "auth0-js"

const Home = () => {
  const auth0Instance = new auth0.WebAuth({
    domain: process.env.NEXT_PUBLIC_AUTH0_DOMAIN as string,
    clientID: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID as string,
  })

  const authorize = () => {
    auth0Instance.authorize({
      nonce: 'felipe_123',
      redirectUri: 'http://localhost:3000',
      responseType: 'id_token',
      scope: 'openid profile email'
    })
  }

  const signOut = () => {
    auth0Instance.logout({
      returnTo: 'http://localhost:3000'
    })
  }

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <button onClick={authorize}>Login</button>
      <button onClick={signOut}>Logout</button>
    </div>
  );
}

export default Home;