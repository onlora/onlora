'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { signInWithLens, useSession } from '@/lib/authClient'
import { lensClient } from '@/lib/lens-client'
import { evmAddress } from '@lens-protocol/client'
import { fetchAccountsAvailable } from '@lens-protocol/client/actions'
import { ConnectKitButton } from 'connectkit'
import { ExternalLink, Loader2, User, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAccount, useDisconnect } from 'wagmi'
import { useWalletClient } from 'wagmi'

const LENS_ONBOARDING_URL = 'https://onboarding.lens.xyz'

// Define types for Lens account
interface LensAccount {
  account: {
    address: string
    username?: {
      value?: string
      localName?: string
    }
    metadata?: {
      picture?:
        | string
        | {
            optimized?: {
              uri: string
            }
          }
    }
  }
}

export function SignInButton() {
  const { data: session } = useSession()
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { disconnect } = useDisconnect()
  const router = useRouter()

  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [accounts, setAccounts] = useState<LensAccount[]>([])
  const [noAccountsFound, setNoAccountsFound] = useState(false)

  const isLoggedIn = !!session?.user

  const handleClose = () => {
    setIsOpen(false)
    setAccounts([])
    setNoAccountsFound(false)
    setIsLoading(false)
    setIsSigningIn(false)
  }

  const fetchAccounts = useCallback(async () => {
    if (!address || !walletClient) return

    setIsLoading(true)
    setNoAccountsFound(false)
    setAccounts([])

    try {
      const result = await fetchAccountsAvailable(lensClient, {
        managedBy: evmAddress(address),
        includeOwned: true,
      })

      console.log('fetchAccountsAvailable', result)

      if (result.isOk()) {
        const fetchedAccounts = result.value.items || []
        if (fetchedAccounts.length > 0) {
          setAccounts(fetchedAccounts as unknown as LensAccount[])
        } else {
          setNoAccountsFound(true)
        }
      } else {
        toast.error(
          `Failed to fetch accounts: ${result.error.message || 'Unknown error'}`,
        )
        setNoAccountsFound(true)
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error(`Failed to fetch accounts: ${message}`)
      setNoAccountsFound(true)
    } finally {
      setIsLoading(false)
    }
  }, [address, walletClient])

  const handleLensLogin = async (selectedAccount: { address: string }) => {
    if (!walletClient) return

    try {
      setIsSigningIn(true)

      const result = await signInWithLens(walletClient, selectedAccount.address)

      if (result.error) {
        throw new Error(result.error)
      }

      toast.success('Successfully signed in!')
      router.refresh()
      handleClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error signing in')
    } finally {
      setIsSigningIn(false)
    }
  }

  // Show nothing when logged in
  if (isLoggedIn) return null

  return (
    <>
      {!address || !walletClient ? (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <Button
              variant="default"
              onClick={show}
              className="w-full rounded-xl border-0 shadow-none bg-primary/10 hover:bg-primary/20 text-primary transition-all duration-200"
            >
              <Wallet className="mr-2 h-4 w-4" />
              Connect Wallet
            </Button>
          )}
        </ConnectKitButton.Custom>
      ) : (
        <Button
          variant="default"
          className="w-full rounded-xl border-0 shadow-none bg-primary text-primary-foreground hover:opacity-90 transition-all duration-200"
          onClick={() => {
            setIsOpen(true)
            fetchAccounts()
          }}
        >
          <User className="mr-2 h-4 w-4" />
          Sign in with Lens
        </Button>
      )}

      <Dialog
        open={isOpen && !!address && !!walletClient}
        onOpenChange={(open) => !open && handleClose()}
      >
        <DialogContent className="sm:max-w-md p-0 rounded-2xl overflow-hidden border-0 shadow-lg">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-xl font-bold">
              {noAccountsFound ? 'No Account Found' : 'Choose Account'}
            </DialogTitle>
          </DialogHeader>

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Loading accounts...</p>
            </div>
          )}

          {!isLoading && accounts.length > 0 && (
            <div className="max-h-[400px] overflow-y-auto p-6 pt-2 space-y-3">
              {accounts.map((item) => {
                const account = item.account
                const username =
                  account?.username?.value || account?.username?.localName
                const displayName =
                  username ||
                  account?.address?.substring(0, 10) ||
                  'Unnamed Account'

                return (
                  <Button
                    key={account?.address}
                    variant="outline"
                    disabled={isSigningIn}
                    onClick={() => handleLensLogin(account)}
                    className="w-full flex items-center justify-between p-4 h-auto rounded-xl border border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200"
                  >
                    <div className="flex items-center">
                      {account?.metadata?.picture ? (
                        <img
                          src={
                            typeof account.metadata.picture === 'object'
                              ? account.metadata.picture.optimized?.uri || ''
                              : account.metadata.picture || ''
                          }
                          alt={displayName}
                          className="w-10 h-10 rounded-xl mr-3 object-cover border-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mr-3">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div className="text-left">
                        <p className="font-medium">{displayName}</p>
                        {account?.address && (
                          <p className="text-xs text-muted-foreground">
                            {account.address.substring(0, 6)}...
                            {account.address.substring(
                              account.address.length - 4,
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    {isSigningIn && (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    )}
                  </Button>
                )
              })}
            </div>
          )}

          {!isLoading && noAccountsFound && (
            <div className="flex flex-col items-center space-y-4 py-12 px-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
                <User className="h-8 w-8 text-primary" />
              </div>
              <p className="text-center">No account found for this wallet.</p>
              <Button
                variant="default"
                onClick={() => window.open(LENS_ONBOARDING_URL, '_blank')}
                className="w-full rounded-xl border-0 bg-primary text-primary-foreground hover:opacity-90 transition-all duration-200"
              >
                Create Account
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          <DialogFooter className="bg-muted/30 px-6 py-4 flex-row justify-between border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                disconnect?.()
                handleClose()
              }}
              className="text-sm hover:bg-transparent hover:text-primary transition-colors"
            >
              Disconnect
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="text-sm border-0 hover:bg-primary/10 transition-colors"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
