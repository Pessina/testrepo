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
      scope: 'openid profile email', 
    })
  }

  const signOut = () => {
    auth0Instance.logout({
      returnTo: 'http://localhost:3000'
    })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="space-y-4">
        <button 
          onClick={authorize}
          className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Sign in with Auth0
        </button>
        <button
          onClick={signOut} 
          className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export default Home;