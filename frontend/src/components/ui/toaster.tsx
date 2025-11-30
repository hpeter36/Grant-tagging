import {
    Toast,
    ToastClose,
    ToastProvider,
    ToastViewport,
  } from "./toast"
  import { useToast } from "./use-toast"
  
  export function Toaster() {
    const { toasts } = useToast()
  
    return (
      <ToastProvider>
        {toasts.map(function ({ id, title, description, action, ...props }) {
          return (
            <Toast
              key={id}
              title={title}       // Pass title as a prop
              description={description} // Pass description as a prop
              action={action}
              {...props}
            >
              {/* The Toast component internally renders ToastTitle and ToastDescription */}
              <ToastClose />
            </Toast>
          )
        })}
        <ToastViewport />
      </ToastProvider>
    )
  }