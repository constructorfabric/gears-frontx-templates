/**
 * Sidebar Component - Based on shadcn/ui sidebar
 * Collapsible navigation; below 768px the expanded menu overlays the content
 */

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/app/lib/utils"
import styles from "./sidebar.module.css"

const Sidebar = (
  {
    ref,
    collapsed = false,
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLElement> & {
    collapsed?: boolean;
    ref?: React.Ref<HTMLElement>;
  }
) => {
  return (
    <aside
      ref={ref}
      data-state={collapsed ? "collapsed" : "expanded"}
      data-collapsible={collapsed ? "icon" : ""}
      className={cn(styles.sidebar, className)}
      {...props}
    >
      {children}
    </aside>
  )
}
Sidebar.displayName = "Sidebar"

const SidebarContent = (
  {
    ref,
    className,
    ...props
  }: React.ComponentProps<"div"> & {
    ref?: React.Ref<HTMLDivElement>;
  }
) => (<div
  ref={ref}
  data-sidebar="content"
  className={cn(styles.content, className)}
  {...props}
/>)
SidebarContent.displayName = "SidebarContent"

const SidebarMenu = (
  {
    ref,
    className,
    ...props
  }: React.ComponentProps<"ul"> & {
    ref?: React.Ref<HTMLUListElement>;
  }
) => (<ul
  ref={ref}
  data-sidebar="menu"
  className={cn(styles.menu, className)}
  {...props}
/>)
SidebarMenu.displayName = "SidebarMenu"

const SidebarMenuItem = (
  {
    ref,
    className,
    ...props
  }: React.ComponentProps<"li"> & {
    ref?: React.Ref<HTMLLIElement>;
  }
) => (<li
  ref={ref}
  data-sidebar="menu-item"
  className={cn(styles.menuItem, className)}
  {...props}
/>)
SidebarMenuItem.displayName = "SidebarMenuItem"

type SidebarMenuButtonVariant = "default" | "outline"
type SidebarMenuButtonSize = "default" | "sm" | "lg"

const SIDEBAR_MENU_BUTTON_VARIANT_CLASSES: Record<SidebarMenuButtonVariant, string | undefined> = {
  default: undefined,
  outline: styles.outline,
}

const SIDEBAR_MENU_BUTTON_SIZE_CLASSES: Record<SidebarMenuButtonSize, string> = {
  default: styles.sizeDefault,
  sm: styles.sizeSm,
  lg: styles.sizeLg,
}

function sidebarMenuButtonVariants({
  variant = "default",
  size = "default",
}: {
  variant?: SidebarMenuButtonVariant
  size?: SidebarMenuButtonSize
}) {
  return cn(
    styles.menuButton,
    SIDEBAR_MENU_BUTTON_VARIANT_CLASSES[variant],
    SIDEBAR_MENU_BUTTON_SIZE_CLASSES[size]
  )
}

const SidebarMenuButton = (
  {
    ref,
    asChild = false,
    isActive = false,
    variant = "default",
    size = "default",
    tooltip,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<"button"> & {
    asChild?: boolean;
    isActive?: boolean;
    variant?: SidebarMenuButtonVariant;
    size?: SidebarMenuButtonSize;
    tooltip?: string;
    ref?: React.Ref<HTMLButtonElement>;
  }
) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      title={tooltip}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
SidebarMenuButton.displayName = "SidebarMenuButton"

const SidebarMenuIcon = (
  {
    ref,
    className,
    ...props
  }: React.ComponentProps<"span"> & {
    ref?: React.Ref<HTMLSpanElement>;
  }
) => (<span
  ref={ref}
  className={cn(styles.menuIcon, className)}
  {...props}
/>)
SidebarMenuIcon.displayName = "SidebarMenuIcon"

const SidebarMenuLabel = (
  {
    ref,
    className,
    ...props
  }: React.ComponentProps<"span"> & {
    ref?: React.Ref<HTMLSpanElement>;
  }
) => (<span
  ref={ref}
  className={cn(className)}
  {...props}
/>)
SidebarMenuLabel.displayName = "SidebarMenuLabel"

export interface SidebarHeaderProps extends React.ComponentProps<"div"> {
  logo?: React.ReactNode
  logoText?: React.ReactNode
  collapsed?: boolean
  onClick?: () => void
}

const SidebarHeader = (
  {
    ref,
    logo,
    logoText,
    collapsed = false,
    onClick,
    className,
    ...props
  }: SidebarHeaderProps & {
    ref?: React.Ref<HTMLDivElement>;
  }
) => {
  return (
    <div
      ref={ref}
      className={cn(styles.header, className)}
      {...props}
    >
      <div className={styles.headerRow}>
        <SidebarMenuButton onClick={onClick} tooltip={collapsed ? "Expand menu" : "Collapse menu"}>
          {logo && <SidebarMenuIcon>{logo}</SidebarMenuIcon>}
          {logoText && (
            <SidebarMenuLabel className={styles.logoText}>
              {logoText}
            </SidebarMenuLabel>
          )}
        </SidebarMenuButton>
      </div>
      <div className={styles.headerDivider} />
    </div>
  )
}
SidebarHeader.displayName = "SidebarHeader"

export {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuLabel,
  SidebarMenuIcon,
  SidebarHeader,
}
