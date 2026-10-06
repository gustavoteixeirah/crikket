import { sendEmailVerificationOtpStrictProcedure } from "@crikket/auth/procedures/email-otp"
import {
  addExistingOrganizationMemberProcedure,
  getAuthEmailDeliveryStatusProcedure,
  getOrganizationInvitationProcedure,
  getPublicAuthConfigProcedure,
} from "@crikket/auth/procedures/organization-invitation"
import {
  getMyOrganizationsProcedure,
  setPreferredOrganizationProcedure,
} from "@crikket/auth/procedures/organization-preference"

export const authRouter = {
  addExistingOrganizationMember: addExistingOrganizationMemberProcedure,
  getAuthEmailDeliveryStatus: getAuthEmailDeliveryStatusProcedure,
  getPublicAuthConfig: getPublicAuthConfigProcedure,
  getMyOrganizations: getMyOrganizationsProcedure,
  getOrganizationInvitation: getOrganizationInvitationProcedure,
  sendEmailVerificationOtpStrict: sendEmailVerificationOtpStrictProcedure,
  setPreferredOrganization: setPreferredOrganizationProcedure,
}
